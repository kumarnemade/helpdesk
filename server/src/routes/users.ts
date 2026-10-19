import { Router } from "express";
import { prisma } from "../db";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  // Explicit fields so new user columns aren't exposed by default.
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ users });
});
