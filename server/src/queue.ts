import { PgBoss } from "pg-boss";

// Background jobs, stored in Postgres by pg-boss in its own `pgboss` schema
// (created and migrated by pg-boss on start; Prisma only manages `public`).
// Jobs survive server restarts and failed jobs are retried.
export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });

boss.on("error", (err) => console.error("pg-boss error:", err));

// AI category for a new ticket. Payload: { ticketId }.
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";

export type ClassifyTicketJob = { ticketId: number };

// AI auto-resolution of a new ticket from the knowledge base. Payload: { ticketId }.
export const AUTO_RESOLVE_TICKET_QUEUE = "auto-resolve-ticket";

// Auto-resolve jobs that failed every retry, copied here by pg-boss so the
// ticket can be handed to agents instead of staying "processing". Same payload.
export const AUTO_RESOLVE_TICKET_FAILED_QUEUE = "auto-resolve-ticket-failed";

export type AutoResolveTicketJob = { ticketId: number };

// Emails an agent or AI reply to the ticket's customer through Gmail. Payload: { replyId }.
export const SEND_REPLY_EMAIL_QUEUE = "send-reply-email";

export type SendReplyEmailJob = { replyId: number };

// Reads new emails from the Gmail inbox, run every minute by a pg-boss schedule. No payload.
export const POLL_GMAIL_INBOX_QUEUE = "poll-gmail-inbox";

// Every minute, in pg-boss's cron syntax.
export const POLL_GMAIL_INBOX_CRON = "* * * * *";

// Retries about 30 s, 1 min and 2 min after a failure; a job running longer
// than a minute (e.g. a worker that died) is retried too.
const retryOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60,
};

const autoResolveTicketQueueOptions = { ...retryOptions, deadLetter: AUTO_RESOLVE_TICKET_FAILED_QUEUE };

// A failed poll isn't retried, since the next one is a minute away anyway. A
// poll stuck for two minutes (e.g. a hung IMAP connection) is expired.
const pollGmailInboxQueueOptions = { retryLimit: 0, expireInSeconds: 120 };

// Starts pg-boss and makes sure the queues exist with the options above.
// createQueue leaves an existing queue as it is, so updateQueue applies
// changed options. Call before the server accepts requests. A dead-letter
// queue must exist before the queue that uses it. A queue's policy can only
// be set when it's created: the inbox poller's "exclusive" policy allows one
// queued or running poll, so slow polls don't pile up.
export async function startQueue() {
  await boss.start();
  const queues = [
    [CLASSIFY_TICKET_QUEUE, retryOptions, "standard"],
    [AUTO_RESOLVE_TICKET_FAILED_QUEUE, retryOptions, "standard"],
    [AUTO_RESOLVE_TICKET_QUEUE, autoResolveTicketQueueOptions, "standard"],
    [SEND_REPLY_EMAIL_QUEUE, retryOptions, "standard"],
    [POLL_GMAIL_INBOX_QUEUE, pollGmailInboxQueueOptions, "exclusive"],
  ] as const;
  for (const [name, options, policy] of queues) {
    await boss.createQueue(name, { ...options, policy });
    await boss.updateQueue(name, options);
  }
}
