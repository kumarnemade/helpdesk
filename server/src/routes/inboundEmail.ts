import { receiveEmailSchema, type ReceiveEmailInput } from "core";
import { Router } from "express";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";

export const inboundEmailRouter = Router();

// Returns the ticket an email with this Message-ID was already stored on
// (as the ticket itself or one of its replies), so provider retries don't
// create duplicates.
async function findTicketForMessageId(emailMessageId: string | undefined) {
  if (!emailMessageId) return null;
  const [ticket, reply] = await Promise.all([
    prisma.ticket.findUnique({ where: { emailMessageId }, select: { id: true } }),
    prisma.reply.findUnique({ where: { emailMessageId }, select: { ticketId: true } }),
  ]);
  return ticket?.id ?? reply?.ticketId ?? null;
}

// Threads a reply onto the newest ticket whose opening email or one of whose
// replies it references. Only the ticket's own sender can reply onto it, so a
// third party who learns a Message-ID can't inject into someone else's ticket.
// Closed tickets aren't reopened: the reply starts a new ticket instead.
async function findTicketToThread(email: ReceiveEmailInput) {
  const referenced = [email.inReplyTo, ...(email.references ?? [])].filter(
    (id): id is string => id !== undefined,
  );
  if (referenced.length === 0) return null;
  const ticket = await prisma.ticket.findFirst({
    where: {
      senderEmail: email.from,
      status: { not: "closed" },
      OR: [
        { emailMessageId: { in: referenced } },
        { replies: { some: { emailMessageId: { in: referenced } } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true },
  });
  return ticket;
}

inboundEmailRouter.post("/", async (req, res) => {
  const parsed = receiveEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const email = parsed.data;

  const duplicateOf = await findTicketForMessageId(email.messageId);
  if (duplicateOf !== null) {
    res.json({ ticketId: duplicateOf, created: false });
    return;
  }

  try {
    const thread = await findTicketToThread(email);
    if (thread) {
      await prisma.ticket.update({
        where: { id: thread.id },
        data: {
          // A reply from the customer reopens a resolved ticket.
          ...(thread.status === "resolved" && { status: "open" }),
          replies: {
            create: {
              body: email.text,
              bodyHtml: email.html,
              senderType: "customer",
              senderName: email.fromName,
              senderEmail: email.from,
              emailMessageId: email.messageId,
            },
          },
        },
      });
      res.json({ ticketId: thread.id, created: false });
      return;
    }

    const ticket = await prisma.ticket.create({
      data: {
        subject: email.subject,
        body: email.text,
        bodyHtml: email.html,
        senderName: email.fromName,
        senderEmail: email.from,
        emailMessageId: email.messageId,
      },
      select: { id: true },
    });
    res.status(201).json({ ticketId: ticket.id, created: true });
  } catch (err) {
    // Two deliveries of the same email raced past the duplicate check.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const ticketId = await findTicketForMessageId(email.messageId);
      if (ticketId !== null) {
        res.json({ ticketId, created: false });
        return;
      }
    }
    throw err;
  }
});
