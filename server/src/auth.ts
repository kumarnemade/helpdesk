import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

// Sessions are stored in the `session` table (no cookie cache), so every
// getSession call is checked against the database.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Public sign-up is off: users are created by an admin (Phase 3).
  emailAndPassword: { enabled: true, disableSignUp: true },
  trustedOrigins: [process.env.CLIENT_ORIGIN ?? "http://localhost:5173"],
});

export type AuthSession = typeof auth.$Infer.Session;
