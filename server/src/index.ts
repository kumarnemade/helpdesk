import { aiConfigured } from "./ai";
import { app } from "./app";
import { autoResolveTicketFailedJob, autoResolveTicketJob } from "./autoResolveTicket";
import { classifyTicketJob } from "./classifyTicket";
import { prisma } from "./db";
import {
  AUTO_RESOLVE_TICKET_FAILED_QUEUE,
  AUTO_RESOLVE_TICKET_QUEUE,
  boss,
  CLASSIFY_TICKET_QUEUE,
  startQueue,
} from "./queue";

const port = Number(process.env.PORT ?? 3000);

// The queue must be running before requests arrive, since the inbound-email
// webhook queues jobs. Without an AI key no AI jobs are queued, so there are
// no workers either.
await startQueue();
if (aiConfigured) {
  await boss.work(CLASSIFY_TICKET_QUEUE, async ([job]) => {
    if (job) await classifyTicketJob(job.data, job.signal);
  });
  await boss.work(AUTO_RESOLVE_TICKET_QUEUE, async ([job]) => {
    if (job) await autoResolveTicketJob(job.data, job.signal);
  });
  await boss.work(AUTO_RESOLVE_TICKET_FAILED_QUEUE, async ([job]) => {
    if (job) await autoResolveTicketFailedJob(job.data);
  });
} else {
  // Nothing will finish auto-resolving these (e.g. the key was removed), so
  // hand them to agents rather than leave them hidden from the ticket list.
  await prisma.ticket.updateMany({ where: { status: "processing" }, data: { status: "open" } });
}

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

async function shutdown() {
  server.close();
  // Waits (up to 30 s) for running jobs to finish, then closes pg-boss's pool.
  await boss.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
