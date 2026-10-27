import {
  createReplySchema,
  listTicketsQuerySchema,
  polishReplySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
  type SortOrder,
  type TicketSortField,
  type TicketStatus,
} from "core";
import { Router } from "express";
import { fromPrisma } from "pg-boss";
import { aiConfigured, polishReply, summarizeTicket } from "../ai";
import { AI_AGENT_EMAIL } from "../aiAgent";
import { prisma } from "../db";
import type { Prisma } from "../generated/prisma/client";
import { emailConfigured, newOutgoingMessageId } from "../mailer";
import { boss, SEND_REPLY_EMAIL_QUEUE, type SendReplyEmailJob } from "../queue";

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
// (new → open → resolved → closed; processing tickets aren't listed), not
// alphabetically. Tickets without a
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

// Optional search and status/category filters, then sorting; id breaks ties so
// the order is stable (e.g. tickets created in the same millisecond) and pages
// don't overlap. Returns one page plus the total number of matching tickets; a
// page past the end is empty but still reports the total.
ticketsRouter.get("/", async (req, res) => {
  const parsed = listTicketsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { search, status, category, sortBy, sortOrder, page, pageSize } = parsed.data;

  // Unset filters are undefined, which Prisma ignores; "none" matches tickets
  // that have no category yet. Tickets AI is still trying to resolve
  // ("processing") are never listed; the status filter can't ask for them.
  const where: Prisma.TicketWhereInput = {
    status: status ?? { not: "processing" },
    category: category === "none" ? null : category,
    OR: search ? searchFields(search) : undefined,
  };

  // One transaction so the total matches the page it's returned with.
  const [tickets, total] = await prisma.$transaction([
    prisma.ticket.findMany({
      where,
      select: ticketListSelect,
      orderBy: [ticketOrderBy(sortBy, sortOrder), { id: sortOrder }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);
  res.json({ tickets, total });
});

// People a ticket can be assigned to: every active user (agents and admins)
// except the AI agent, which only auto-resolution assigns, for the assignee
// dropdown. Registered before "/:id" so "assignees" isn't
// read as a ticket id. /api/users is admin-only, so agents need this instead.
ticketsRouter.get("/assignees", async (_req, res) => {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, email: { not: AI_AGENT_EMAIL } },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  res.json({ users });
});

// One ticket with its opening email. Explicit fields as above: bodyHtml
// (untrusted sender HTML) and the email Message-ID stay server-side.
const ticketDetailSelect = {
  ...ticketListSelect,
  body: true,
  updatedAt: true,
} as const satisfies Prisma.TicketSelect;

ticketsRouter.get("/:id", async (req, res) => {
  const parsed = ticketIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.id },
    select: ticketDetailSelect,
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json({ ticket });
});

// Partially update a ticket: assign it (to an active user, or null to
// unassign), change its status, or set its category (null = uncategorised).
// Admins and agents can both do this. Returns the updated ticket like GET /:id.
ticketsRouter.patch("/:id", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const body = updateTicketSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { id } = params.data;
  const { assignedToId, status, category } = body.data;

  const existing = await prisma.ticket.findUnique({ where: { id }, select: { status: true } });
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // resolvedAt is set when a ticket becomes resolved or closed and cleared when
  // it goes back to new/open; resolved → closed keeps the original time.
  const isResolved = (value: TicketStatus) => value === "resolved" || value === "closed";
  const resolvedAt =
    status && isResolved(status) !== isResolved(existing.status) ? (isResolved(status) ? new Date() : null) : undefined;

  // Deleted users can't be assigned new tickets, and only auto-resolution
  // assigns the AI agent. Only checked when an assignee is sent (undefined
  // leaves it unchanged, null unassigns).
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, deletedAt: null },
      select: { email: true },
    });
    if (!assignee) {
      res.status(400).json({ error: "Assignee not found" });
      return;
    }
    if (assignee.email === AI_AGENT_EMAIL) {
      res.status(400).json({ error: "Tickets can't be assigned to the AI agent" });
      return;
    }
  }

  // Undefined fields are left as they are by Prisma.
  const ticket = await prisma.ticket.update({
    where: { id },
    data: { assignedToId, status, category, resolvedAt },
    select: ticketDetailSelect,
  });
  res.json({ ticket });
});

// Replies in a ticket's thread: customer emails and agent replies. Explicit
// fields as above: bodyHtml (untrusted sender HTML) and the Message-ID stay
// server-side.
const replySelect = {
  id: true,
  body: true,
  senderType: true,
  senderName: true,
  senderEmail: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} as const satisfies Prisma.ReplySelect;

// The ticket's replies, oldest first (id breaks ties) so the thread reads top
// to bottom.
ticketsRouter.get("/:id/replies", async (req, res) => {
  const parsed = ticketIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.id },
    select: { replies: { select: replySelect, orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }
  res.json({ replies: ticket.replies });
});

// Add an agent reply, written by the signed-in user (admins and agents). The
// sender name and email are the user's own, never taken from the request.
// The ticket's status is left unchanged, and no email is sent yet.
ticketsRouter.post("/:id/replies", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const body = createReplySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { id } = params.data;

  const existing = await prisma.ticket.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // With Gmail configured, the email to the customer is queued in the same
  // transaction, so it's sent exactly when the reply is saved; the agent gets
  // the response without waiting for Gmail.
  const { user } = res.locals;
  const reply = await prisma.$transaction(async (tx) => {
    const created = await tx.reply.create({
      data: {
        ticketId: id,
        body: body.data.body,
        senderType: "agent",
        senderName: user.name,
        senderEmail: user.email,
        authorId: user.id,
        emailMessageId: emailConfigured ? newOutgoingMessageId() : undefined,
      },
      select: replySelect,
    });
    if (emailConfigured) {
      const job: SendReplyEmailJob = { replyId: created.id };
      await boss.send(SEND_REPLY_EMAIL_QUEUE, job, { db: fromPrisma(tx) });
    }
    return created;
  });
  res.status(201).json({ reply });
});

// Rewrite an agent's draft reply with AI, using the ticket's subject and
// customer name as context, and sign it with the signed-in agent's name (from
// the session, never the request). Nothing is saved; the agent reviews the result in
// the reply form before sending it.
ticketsRouter.post("/:id/replies/polish", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const body = polishReplySchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!aiConfigured) {
    res.status(503).json({ error: "Reply polishing isn't configured" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.data.id },
    select: { subject: true, senderName: true },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Stop the model call if the agent navigates away or the request is cancelled.
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const polished = await polishReply({
    body: body.data.body,
    subject: ticket.subject,
    customerName: ticket.senderName,
    agentName: res.locals.user.name,
    signal: controller.signal,
  });
  res.json({ body: polished });
});

// Summarise a ticket and its conversation with AI. Generated fresh on every
// call and never saved, so it always reflects the latest replies. Uses only the
// plain-text bodies (bodyHtml is untrusted sender HTML).
ticketsRouter.post("/:id/summary", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  if (!aiConfigured) {
    res.status(503).json({ error: "Ticket summaries aren't configured" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.data.id },
    select: {
      subject: true,
      status: true,
      senderName: true,
      body: true,
      replies: {
        select: { senderType: true, senderName: true, body: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Stop the model call if the agent navigates away or the request is cancelled.
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  const summary = await summarizeTicket({
    subject: ticket.subject,
    status: ticket.status,
    customerName: ticket.senderName,
    body: ticket.body,
    replies: ticket.replies,
    signal: controller.signal,
  });
  res.json({ summary });
});
