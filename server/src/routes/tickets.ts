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

// Case-insensitive substring match (Postgres ILIKE) on subject, sender name or
// sender email. Prisma passes LIKE wildcards through, so escape them to
// search for a literal "%" or "_".
function searchFields(search: string): Prisma.TicketWhereInput[] {
  const contains = search.replace(/[\\%_]/g, "\\$&");
  return (["subject", "senderName", "senderEmail"] as const).map((field) => ({
    [field]: { contains, mode: "insensitive" },
  }));
}

// Optional search and status/category filters, then sorting; id breaks ties so the order
// is stable (e.g. tickets created in the same millisecond). No pagination yet:
// returns every matching ticket.
ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { search, status, category, sortBy, sortOrder } = parsed.data;

  const tickets = await prisma.ticket.findMany({
    // Unset filters are undefined, which Prisma ignores; "none" matches
    // tickets that have no category yet.
    where: {
      status,
      category: category === "none" ? null : category,
      OR: search ? searchFields(search) : undefined,
    },
    select: ticketListSelect,
    orderBy: [ticketOrderBy(sortBy, sortOrder), { id: sortOrder }],
  });
  res.json({ tickets });
});
