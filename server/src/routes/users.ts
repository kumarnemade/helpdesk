import { createUserSchema, userIdParamsSchema } from "core";
import { Router } from "express";
import { AI_AGENT_EMAIL } from "../aiAgent";
import { auth } from "../auth";
import { prisma } from "../db";

export const usersRouter = Router();

// Explicit fields so new user columns aren't exposed by default.
const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    // The AI agent is system-owned; hiding it keeps it from being deleted by accident.
    where: { deletedAt: null, email: { not: AI_AGENT_EMAIL } },
    select: userSelect,
    orderBy: { createdAt: "asc" },
  });
  res.json({ users });
});

// Public sign-up is disabled, so admins create users through Better Auth's
// internal adapter (as prisma/seed.ts does), which hashes the password the
// same way sign-in expects. New users are always agents.
usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { name, email, password } = parsed.data;

  // Soft-deleted users keep their row, so their email stays taken.
  const existing = await prisma.user.findUnique({ where: { email }, select: { deletedAt: true } });
  if (existing) {
    res.status(409).json({
      error: existing.deletedAt
        ? "This email belongs to a deleted user"
        : "A user with this email already exists",
    });
    return;
  }

  const ctx = await auth.$context;
  const created = await ctx.internalAdapter.createUser(
    { name, email, emailVerified: true, role: "agent" },
    { method: "admin" },
  );
  try {
    await ctx.internalAdapter.linkAccount({
      providerId: "credential",
      accountId: created.id,
      userId: created.id,
      password: await ctx.password.hash(password),
    });
  } catch (err) {
    // Don't leave a user behind that can never sign in.
    await ctx.internalAdapter.deleteUser(created.id);
    throw err;
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: created.id },
    select: userSelect,
  });
  res.status(201).json({ user });
});

// Soft delete: the row is kept with deletedAt set, the user disappears from
// the API and their sessions are revoked. Sign-in is blocked by the session
// hook in auth.ts. Admins can't be deleted (which also stops self-deletion).
usersRouter.delete("/:id", async (req, res) => {
  const parsed = userIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { id } = parsed.data;

  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: { role: true, email: true },
  });
  if (!user || user.email === AI_AGENT_EMAIL) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.role === "admin") {
    res.status(403).json({ error: "Admins cannot be deleted" });
    return;
  }

  // Deleted users can't be assigned tickets, so their tickets go back to
  // Unassigned in the same transaction.
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { deletedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: id } }),
    prisma.ticket.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } }),
  ]);
  res.status(204).end();
});
