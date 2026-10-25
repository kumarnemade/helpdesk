import { DASHBOARD_CHART_DAYS, dashboardQuerySchema } from "core";
import { Router } from "express";
import { prisma } from "../db";

export const dashboardRouter = Router();

// Ticket overview for the dashboard (admins and agents):
// - totalTickets: every ticket, including ones AI is still processing.
// - openTickets: tickets with status "open".
// - aiResolvedTickets: tickets AI auto-resolved, i.e. that have an AI reply
//   (it only replies when resolving), even if the customer reopened them since.
// - aiResolvedPercent: aiResolvedTickets / totalTickets, one decimal place.
// - averageResolutionSeconds: mean time from arrival to resolvedAt over
//   resolved and closed tickets, or null when there are none.
// - ticketsPerDay: tickets received on each of the last DASHBOARD_CHART_DAYS
//   days (oldest first, ending today, empty days as 0), with days in the
//   `timeZone` query param.
dashboardRouter.get("/", async (req, res) => {
  const parsed = dashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { timeZone } = parsed.data;

  // One transaction so the numbers agree with each other. Postgres's AVG
  // returns numeric (a Prisma Decimal) and COUNT bigint, so they're cast to
  // plain numbers. createdAt is stored as UTC without a zone, hence the double
  // AT TIME ZONE to get its local date.
  const [totalTickets, openTickets, aiResolvedTickets, [average], ticketsPerDay] = await prisma.$transaction([
    prisma.ticket.count(),
    prisma.ticket.count({ where: { status: "open" } }),
    prisma.ticket.count({ where: { replies: { some: { senderType: "ai" } } } }),
    prisma.$queryRaw<[{ seconds: number | null }]>`
      SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))::float8 AS seconds
      FROM "ticket"
      WHERE "resolvedAt" IS NOT NULL`,
    prisma.$queryRaw<{ date: string; count: number }[]>`
      WITH days AS (
        SELECT generate_series(
          (now() AT TIME ZONE ${timeZone})::date - ${DASHBOARD_CHART_DAYS - 1}::int,
          (now() AT TIME ZONE ${timeZone})::date,
          interval '1 day'
        )::date AS day
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date, COUNT(t.id)::int AS count
      FROM days
      LEFT JOIN "ticket" t ON (t."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone})::date = days.day
      GROUP BY days.day
      ORDER BY days.day`,
  ]);

  res.json({
    totalTickets,
    openTickets,
    aiResolvedTickets,
    aiResolvedPercent: totalTickets === 0 ? 0 : Math.round((aiResolvedTickets / totalTickets) * 1000) / 10,
    averageResolutionSeconds: average?.seconds ?? null,
    ticketsPerDay,
  });
});
