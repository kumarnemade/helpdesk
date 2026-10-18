// Seeds the admin user. Run with `bun run db:seed` from server/.
// Public sign-up is disabled, so the user is created through Better Auth's
// internal adapter, which hashes the password the same way sign-in expects.
import { auth, MIN_PASSWORD_LENGTH } from "../src/auth";
import { prisma } from "../src/db";

const email = process.env.SEED_ADMIN_EMAIL;
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password) {
  throw new Error(
    "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set (see server/.env.example)",
  );
}
// The internal adapter skips Better Auth's password checks, so enforce them here.
if (password === "CHANGE_ME" || password.length < MIN_PASSWORD_LENGTH) {
  throw new Error(
    `SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters and not the placeholder`,
  );
}

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(email);
if (existing) {
  console.log(`Admin ${email} already exists, skipping.`);
} else {
  const user = await ctx.internalAdapter.createUser(
    { email, name: "Admin", emailVerified: true, role: "admin" },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    providerId: "credential",
    accountId: user.id,
    userId: user.id,
    password: await ctx.password.hash(password),
  });
  console.log(`Created admin ${email}.`);
}

// Optional agent user (used by the e2e tests). No-op when the vars are unset.
const agentEmail = process.env.SEED_AGENT_EMAIL;
const agentPassword = process.env.SEED_AGENT_PASSWORD;
if (agentEmail && agentPassword) {
  if (agentPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_AGENT_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  const existingAgent = await ctx.internalAdapter.findUserByEmail(agentEmail);
  if (existingAgent) {
    console.log(`Agent ${agentEmail} already exists, skipping.`);
  } else {
    const agent = await ctx.internalAdapter.createUser(
      { email: agentEmail, name: "Agent", emailVerified: true, role: "agent" },
      { method: "admin" },
    );
    await ctx.internalAdapter.linkAccount({
      providerId: "credential",
      accountId: agent.id,
      userId: agent.id,
      password: await ctx.password.hash(agentPassword),
    });
    console.log(`Created agent ${agentEmail}.`);
  }
}

await prisma.$disconnect();
