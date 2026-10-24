import { PgBoss } from "pg-boss";

// Background jobs, stored in Postgres by pg-boss in its own `pgboss` schema
// (created and migrated by pg-boss on start; Prisma only manages `public`).
// Jobs survive server restarts and failed jobs are retried.
export const boss = new PgBoss({ connectionString: process.env.DATABASE_URL, schema: "pgboss" });

boss.on("error", (err) => console.error("pg-boss error:", err));

// AI category for a new ticket. Payload: { ticketId }.
export const CLASSIFY_TICKET_QUEUE = "classify-ticket";

export type ClassifyTicketJob = { ticketId: number };

// Retries about 30 s, 1 min and 2 min after a failure; a job running longer
// than a minute (e.g. a worker that died) is retried too.
const classifyTicketQueueOptions = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60,
};

// Starts pg-boss and makes sure the queues exist with the options above.
// createQueue leaves an existing queue as it is, so updateQueue applies
// changed options. Call before the server accepts requests.
export async function startQueue() {
  await boss.start();
  await boss.createQueue(CLASSIFY_TICKET_QUEUE, classifyTicketQueueOptions);
  await boss.updateQueue(CLASSIFY_TICKET_QUEUE, classifyTicketQueueOptions);
}
