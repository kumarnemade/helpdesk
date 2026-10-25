import { z } from "zod";
import { autoResolveTicket } from "./ai";
import { prisma } from "./db";
import { knowledgeBase } from "./knowledgeBase";

const AUTO_RESOLVE_TIMEOUT_MS = 30_000;

// Who AI replies come from. There's no outbound email yet, so the address is
// only shown in the reply thread.
export const AI_SENDER_NAME = "Helpdesk AI";
export const AI_SENDER_EMAIL = "support@helpdesk.local";

// job.data comes back from the database untyped.
const autoResolveTicketJobSchema = z.object({ ticketId: z.number().int().positive() });

// pg-boss worker for AUTO_RESOLVE_TICKET_QUEUE: moves a new ticket to
// "processing" (hiding it from the ticket list) and asks AI whether the
// knowledge base answers it. If it does, the AI reply is saved and the ticket
// becomes "resolved"; otherwise it becomes "open" for an agent. Errors are
// thrown so pg-boss retries the job (a retry finds the ticket already
// processing). Every update requires the expected status, so a ticket an agent
// has changed in the meantime is left alone.
export async function autoResolveTicketJob(data: unknown, signal: AbortSignal) {
  const { ticketId } = autoResolveTicketJobSchema.parse(data);

  const claimed = await prisma.ticket.updateMany({
    where: { id: ticketId, status: { in: ["new", "processing"] } },
    data: { status: "processing" },
  });
  if (claimed.count === 0) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, body: true, senderName: true },
  });
  if (!ticket) return;

  const result = await autoResolveTicket({
    subject: ticket.subject,
    customerName: ticket.senderName,
    body: ticket.body,
    knowledgeBase,
    signal: AbortSignal.any([signal, AbortSignal.timeout(AUTO_RESOLVE_TIMEOUT_MS)]),
  });

  if (result.action === "resolve" && result.reply) {
    await prisma.$transaction(async (tx) => {
      const resolved = await tx.ticket.updateMany({
        where: { id: ticketId, status: "processing" },
        data: { status: "resolved" },
      });
      if (resolved.count === 0) return;
      await tx.reply.create({
        data: {
          ticketId,
          body: result.reply,
          senderType: "ai",
          senderName: AI_SENDER_NAME,
          senderEmail: AI_SENDER_EMAIL,
        },
      });
    });
    return;
  }

  await handTicketToAgents(ticketId);
}

// Worker for AUTO_RESOLVE_TICKET_FAILED_QUEUE: an auto-resolve job failed every
// retry, so the ticket goes to agents instead of staying hidden.
export async function autoResolveTicketFailedJob(data: unknown) {
  const { ticketId } = autoResolveTicketJobSchema.parse(data);
  await handTicketToAgents(ticketId);
}

// Moves a ticket the AI didn't resolve from "processing" to "open".
async function handTicketToAgents(ticketId: number) {
  await prisma.ticket.updateMany({ where: { id: ticketId, status: "processing" }, data: { status: "open" } });
}
