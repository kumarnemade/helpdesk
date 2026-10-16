import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

const clientOrigin = process.env.CLIENT_ORIGIN;
if (!clientOrigin) {
  throw new Error("CLIENT_ORIGIN is not set");
}

// Sessions are stored in the `session` table (no cookie cache), so every
// getSession call is checked against the database.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Public sign-up is off: users are created by an admin (Phase 3).
  emailAndPassword: { enabled: true, disableSignUp: true },
  user: {
    additionalFields: {
      // Server-owned: input: false stops clients from setting their own role.
      role: {
        type: ["admin", "agent"],
        required: false,
        defaultValue: "agent",
        input: false,
      },
    },
  },
  trustedOrigins: [clientOrigin],
});

export type AuthSession = typeof auth.$Infer.Session;

