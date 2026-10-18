import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

const clientOrigin = process.env.CLIENT_ORIGIN;
if (!clientOrigin) {
  throw new Error("CLIENT_ORIGIN is not set");
}

// Better Auth reads BETTER_AUTH_SECRET itself; refuse to start with a missing,
// placeholder or short secret so sessions are never signed with a weak key.
const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret === "CHANGE_ME" || secret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to at least 32 characters (openssl rand -base64 32)",
  );
}

export const MIN_PASSWORD_LENGTH = 12;

// Set by app.ts from Express's req.ip (which honours TRUST_PROXY), after
// discarding any client-supplied value, so rate limiting can't be dodged by
// spoofing X-Forwarded-For.
export const CLIENT_IP_HEADER = "x-helpdesk-client-ip";

// Sessions are stored in the `session` table (no cookie cache), so every
// getSession call is checked against the database.
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // Public sign-up is off: users are created by an admin (Phase 3).
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
  },
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
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh expiry at most once a day
  },
  // Production only, stored in the `rateLimit` table so it survives restarts.
  rateLimit: {
    enabled: process.env.NODE_ENV === "production",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  trustedOrigins: [clientOrigin],
});

export type AuthSession = typeof auth.$Infer.Session;
