import { aiConfigured } from "./ai";
import { app } from "./app";
import { classifyTicketJob } from "./classifyTicket";
import { prisma } from "./db";
import { boss, CLASSIFY_TICKET_QUEUE, startQueue } from "./queue";

const port = Number(process.env.PORT ?? 3000);

// The queue must be running before requests arrive, since the inbound-email
// webhook queues jobs. Without an AI key no classification jobs are queued,
// so there's no worker either.
await startQueue();
if (aiConfigured) {
  await boss.work(CLASSIFY_TICKET_QUEUE, async ([job]) => {
    if (job) await classifyTicketJob(job.data, job.signal);
  });
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
