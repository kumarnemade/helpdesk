import { z } from "zod";

// Mirror the TicketStatus / TicketCategory enums in server/prisma/schema.prisma.
export const TICKET_STATUSES = ["new", "open", "resolved", "closed"] as const;
export const TICKET_CATEGORIES = [
  "general_question",
  "technical_question",
  "refund_request",
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

// RFC 5322 line length limit.
export const MAX_EMAIL_SUBJECT_LENGTH = 998;
export const MAX_EMAIL_BODY_LENGTH = 100_000;
export const MAX_EMAIL_HTML_LENGTH = 500_000;
export const MAX_SENDER_NAME_LENGTH = 200;
export const MAX_EMAIL_REFERENCES = 100;
export const NO_SUBJECT = "(no subject)";

// Message-IDs are stored without their angle brackets; blank values (some
// providers send "" for a missing header) become undefined.
const emailMessageIdSchema = z
  .string()
  .trim()
  .max(MAX_EMAIL_SUBJECT_LENGTH, "Message-ID is too long")
  .transform((id) => id.replace(/^<(.*)>$/, "$1").trim() || undefined);

// Body of POST /api/inbound-email: one received email, already parsed by the
// email provider (or forwarding script) that calls the webhook.
export const receiveEmailSchema = z.object({
  from: z
    .string({ error: "Sender email is required" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid sender email address")),
  fromName: z
    .string({ error: "Sender name is required" })
    .trim()
    .min(1, "Sender name is required")
    .max(MAX_SENDER_NAME_LENGTH, `Sender name must be at most ${MAX_SENDER_NAME_LENGTH} characters`),
  subject: z
    .string()
    .trim()
    .max(MAX_EMAIL_SUBJECT_LENGTH, `Subject must be at most ${MAX_EMAIL_SUBJECT_LENGTH} characters`)
    .transform((subject) => subject || NO_SUBJECT)
    .prefault(""),
  text: z
    .string({ error: "Email body is required" })
    .trim()
    .min(1, "Email body is required")
    .max(MAX_EMAIL_BODY_LENGTH, `Email body must be at most ${MAX_EMAIL_BODY_LENGTH} characters`),
  // Untrusted HTML from the sender: stored as-is, must be sanitised before display.
  html: z
    .string()
    .max(MAX_EMAIL_HTML_LENGTH, `HTML body must be at most ${MAX_EMAIL_HTML_LENGTH} characters`)
    .transform((html) => (html.trim() ? html : undefined))
    .optional(),
  messageId: emailMessageIdSchema.optional(),
  inReplyTo: emailMessageIdSchema.optional(),
  references: z
    .array(emailMessageIdSchema)
    .max(MAX_EMAIL_REFERENCES, `At most ${MAX_EMAIL_REFERENCES} references are allowed`)
    .transform((ids) => ids.filter((id): id is string => id !== undefined))
    .optional(),
});

export type ReceiveEmailInput = z.infer<typeof receiveEmailSchema>;

// Columns GET /api/tickets can sort by; they double as the tickets table's
// column ids. `assignedTo` sorts by the assignee's name.
export const TICKET_SORT_FIELDS = [
  "subject",
  "senderName",
  "status",
  "category",
  "assignedTo",
  "createdAt",
] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;

export type TicketSortField = (typeof TICKET_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

// Category filter values: a category, or "none" for tickets without one.
export const TICKET_CATEGORY_FILTERS = [...TICKET_CATEGORIES, "none"] as const;

export type TicketCategoryFilter = (typeof TICKET_CATEGORY_FILTERS)[number];

export const MAX_TICKET_SEARCH_LENGTH = 200;

// Optional filters of GET /api/tickets (also the /tickets page's URL params).
// `search` is a case-insensitive text match on subject, sender name or sender
// email; blank searches become undefined.
export const ticketFiltersSchema = z.object({
  search: z
    .string()
    .trim()
    .max(MAX_TICKET_SEARCH_LENGTH, `Search must be at most ${MAX_TICKET_SEARCH_LENGTH} characters`)
    .transform((search) => search || undefined)
    .optional(),
  status: z.enum(TICKET_STATUSES, { error: "Invalid status filter" }).optional(),
  category: z.enum(TICKET_CATEGORY_FILTERS, { error: "Invalid category filter" }).optional(),
});

export type TicketFilters = z.infer<typeof ticketFiltersSchema>;

// Query string of GET /api/tickets: filters plus sorting (newest first by default).
export const listTicketsQuerySchema = ticketFiltersSchema.extend({
  sortBy: z.enum(TICKET_SORT_FIELDS, { error: "Invalid sort field" }).default("createdAt"),
  sortOrder: z.enum(SORT_ORDERS, { error: "Sort order must be asc or desc" }).default("desc"),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
