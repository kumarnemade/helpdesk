import { createUserSchema } from "core";
import { Router } from "express";
import { auth } from "../auth";
import { prisma } from "../db";

export const usersRouter = Router();

// Explicit fields so new user columns aren't exposed by default.
const userSelect = { id: true, name: true, email: true, role: true, createdAt: true } as const;

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
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

  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

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
