import { receiveEmailSchema, type ReceiveEmailInput } from "core";
import { Router } from "express";
import { fromPrisma } from "pg-boss";
import { aiConfigured } from "../ai";
import { findAiAgentId } from "../aiAgent";
import { prisma } from "../db";
import { Prisma } from "../generated/prisma/client";
import {
  AUTO_RESOLVE_TICKET_QUEUE,
  boss,
  CLASSIFY_TICKET_QUEUE,
  type AutoResolveTicketJob,
  type ClassifyTicketJob,
} from "../queue";

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
          ...(thread.status === "resolved" && { status: "open", resolvedAt: null }),
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

    // The classification and auto-resolve jobs are queued in the same
    // transaction, so they exist exactly when the ticket does. pg-boss workers
    // set the category and try to resolve the ticket from the knowledge base
    // later; the provider gets its response right away. Meanwhile the ticket is
    // assigned to the AI agent (when it has been seeded).
    const aiAgentId = aiConfigured ? await findAiAgentId() : null;
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: {
          subject: email.subject,
          body: email.text,
          bodyHtml: email.html,
          senderName: email.fromName,
          senderEmail: email.from,
          emailMessageId: email.messageId,
          assignedToId: aiAgentId,
        },
        select: { id: true },
      });
      if (aiConfigured) {
        const classifyJob: ClassifyTicketJob = { ticketId: created.id };
        const autoResolveJob: AutoResolveTicketJob = { ticketId: created.id };
        await boss.send(CLASSIFY_TICKET_QUEUE, classifyJob, { db: fromPrisma(tx) });
        await boss.send(AUTO_RESOLVE_TICKET_QUEUE, autoResolveJob, { db: fromPrisma(tx) });
      }
      return created;
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
