// Seeds the "AI" agent that new tickets are assigned to while AI
// auto-resolution works on them. Run with `bun run db:seed:ai-agent` from
// server/; safe to re-run. Created through Better Auth's internal adapter like
// the admin, but with no credential account, so nobody can sign in as it.
import { AI_AGENT_EMAIL, AI_AGENT_NAME } from "../src/aiAgent";
import { auth } from "../src/auth";
import { prisma } from "../src/db";

const ctx = await auth.$context;

const existing = await ctx.internalAdapter.findUserByEmail(AI_AGENT_EMAIL);
if (existing) {
  console.log(`AI agent ${AI_AGENT_EMAIL} already exists, skipping.`);
} else {
  await ctx.internalAdapter.createUser(
    { email: AI_AGENT_EMAIL, name: AI_AGENT_NAME, emailVerified: true, role: "agent" },
    { method: "admin" },
  );
  console.log(`Created AI agent ${AI_AGENT_EMAIL}.`);
}

await prisma.$disconnect();
