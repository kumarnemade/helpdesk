import { listTicketsQuerySchema, type SortOrder, type TicketSortField } from "core";
import { Router } from "express";
import { prisma } from "../db";
import type { Prisma } from "../generated/prisma/client";

export const ticketsRouter = Router();

// Explicit fields so new ticket columns aren't exposed by default. The list
// doesn't need the email bodies (bodyHtml is untrusted sender HTML).
const ticketListSelect = {
  id: true,
  subject: true,
  status: true,
  category: true,
  senderName: true,
  senderEmail: true,
  createdAt: true,
  assignedTo: { select: { id: true, name: true } },
} as const;

// status and category are Postgres enums, so they sort in declaration order
// (new → open → resolved → closed), not alphabetically. Tickets without a
// category or assignee use Postgres's default: last ascending, first
// descending (Prisma can't set `nulls` on a relation field).
function ticketOrderBy(sortBy: TicketSortField, sortOrder: SortOrder): Prisma.TicketOrderByWithRelationInput {
  if (sortBy === "assignedTo") return { assignedTo: { name: sortOrder } };
  return { [sortBy]: sortOrder };
}

// id breaks ties so the order is stable (e.g. tickets created in the same
// millisecond). No pagination yet: returns every ticket.
ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { sortBy, sortOrder } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    select: ticketListSelect,
    orderBy: [ticketOrderBy(sortBy, sortOrder), { id: sortOrder }],
  });
  res.json({ tickets });
});
