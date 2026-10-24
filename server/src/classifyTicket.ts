import { aiConfigured, classifyTicket } from "./ai";
import { prisma } from "./db";

const CLASSIFY_TIMEOUT_MS = 30_000;

// Sets the category of a newly created ticket with AI. Meant to run in the
// background after the inbound-email webhook has responded, so it never
// throws: on any failure the ticket stays uncategorised for an agent to set.
// A category an agent picked in the meantime is never overwritten.
export async function classifyNewTicket(ticketId: number) {
  if (!aiConfigured) return;
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { subject: true, body: true, category: true },
    });
    if (!ticket || ticket.category) return;

    const category = await classifyTicket({
      subject: ticket.subject,
      body: ticket.body,
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    await prisma.ticket.updateMany({ where: { id: ticketId, category: null }, data: { category } });
  } catch (err) {
    console.error(`Failed to classify ticket ${ticketId}:`, err);
  }
}
