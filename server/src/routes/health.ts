import * as Sentry from "@sentry/bun";
import { Router } from "express";
import { prisma } from "../db";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  const timestamp = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "ok", timestamp });
  } catch (err) {
    console.error("Database health check failed:", err);
    Sentry.captureException(err);
    res.status(503).json({ status: "error", database: "unreachable", timestamp });
  }
});
