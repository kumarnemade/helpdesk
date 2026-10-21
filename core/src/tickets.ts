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
