import { prisma } from "./db";

// The "AI" agent user that owns tickets while AI auto-resolution works on them
// (created by `bun run db:seed:ai-agent`, without a password so nobody can sign
// in as it). Recognised by this email.
export const AI_AGENT_EMAIL = "ai@helpdesk.local";
export const AI_AGENT_NAME = "AI";

// The AI agent's user id, or null if it hasn't been seeded or was deleted.
export async function findAiAgentId() {
  const agent = await prisma.user.findFirst({
    where: { email: AI_AGENT_EMAIL, deletedAt: null },
    select: { id: true },
  });
  return agent?.id ?? null;
}
