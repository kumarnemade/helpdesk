import { z } from "zod";
import { classifyTicket } from "./ai";
import { prisma } from "./db";

const CLASSIFY_TIMEOUT_MS = 30_000;

// job.data comes back from the database untyped.
const classifyTicketJobSchema = z.object({ ticketId: z.number().int().positive() });

// pg-boss worker for CLASSIFY_TICKET_QUEUE: sets a new ticket's category with
// AI. Errors are thrown so pg-boss marks the job failed and retries it. A
// deleted ticket, or one that already has a category (e.g. set by an agent
// while the job waited), is left alone, and an agent's choice is never
// overwritten.
export async function classifyTicketJob(data: unknown, signal: AbortSignal) {
  const { ticketId } = classifyTicketJobSchema.parse(data);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { subject: true, body: true, category: true },
  });
  if (!ticket || ticket.category) return;

  const category = await classifyTicket({
    subject: ticket.subject,
    body: ticket.body,
    signal: AbortSignal.any([signal, AbortSignal.timeout(CLASSIFY_TIMEOUT_MS)]),
  });
  await prisma.ticket.updateMany({ where: { id: ticketId, category: null }, data: { category } });
}
