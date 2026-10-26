import { fromPrisma } from "pg-boss";
import { z } from "zod";
import { autoResolveTicket } from "./ai";
import { AI_AGENT_EMAIL, AI_AGENT_NAME, findAiAgentId } from "./aiAgent";
import { prisma } from "./db";
import { knowledgeBase } from "./knowledgeBase";
import { emailConfigured, newOutgoingMessageId } from "./mailer";
import { boss, SEND_REPLY_EMAIL_QUEUE, type SendReplyEmailJob } from "./queue";

const AUTO_RESOLVE_TIMEOUT_MS = 30_000;

// job.data comes back from the database untyped.
const autoResolveTicketJobSchema = z.object({ ticketId: z.number().int().positive() });

// pg-boss worker for AUTO_RESOLVE_TICKET_QUEUE: moves a new ticket to
// "processing" (hiding it from the ticket list) and asks AI whether the
// knowledge base answers it. If it does, the AI reply (written by the AI agent)
// is saved (and emailed to the customer when Gmail is configured) and the
// ticket becomes "resolved", still assigned to the AI agent;
// otherwise it becomes "open" and is unassigned from the AI agent. Errors are
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
    const aiAgentId = await findAiAgentId();
    const resolved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.ticket.updateMany({
        where: { id: ticketId, status: "processing" },
        data: { status: "resolved", resolvedAt: new Date() },
      });
      if (count === 0) return false;
      const reply = await tx.reply.create({
        data: {
          ticketId,
          body: result.reply,
          senderType: "ai",
          senderName: AI_AGENT_NAME,
          senderEmail: AI_AGENT_EMAIL,
          authorId: aiAgentId,
          emailMessageId: emailConfigured ? newOutgoingMessageId() : undefined,
        },
        select: { id: true },
      });
      // The customer is emailed the AI's answer, like an agent reply.
      if (emailConfigured) {
        const job: SendReplyEmailJob = { replyId: reply.id };
        await boss.send(SEND_REPLY_EMAIL_QUEUE, job, { db: fromPrisma(tx) });
      }
      return true;
    });
    // An agent changed the status meanwhile: the AI doesn't keep the ticket.
    if (resolved) return;
  }

  await handTicketToAgents(ticketId);
}

// Worker for AUTO_RESOLVE_TICKET_FAILED_QUEUE: an auto-resolve job failed every
// retry, so the ticket goes to agents instead of staying hidden.
export async function autoResolveTicketFailedJob(data: unknown) {
  const { ticketId } = autoResolveTicketJobSchema.parse(data);
  await handTicketToAgents(ticketId);
}

// Moves a ticket the AI didn't resolve from "processing" to "open" and
// unassigns it from the AI agent. An assignee or status an agent set in the
// meantime is kept.
async function handTicketToAgents(ticketId: number) {
  const aiAgentId = await findAiAgentId();
  await prisma.$transaction(async (tx) => {
    await tx.ticket.updateMany({ where: { id: ticketId, status: "processing" }, data: { status: "open" } });
    if (aiAgentId) {
      await tx.ticket.updateMany({ where: { id: ticketId, assignedToId: aiAgentId }, data: { assignedToId: null } });
    }
  });
}
