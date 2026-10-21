import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

// Shared secret the email provider (or forwarding script) sends as
// `Authorization: Bearer <secret>`. Refuse to start without a strong one so
// the inbound webhook is never open to anyone who finds the URL.
const webhookSecret = process.env.INBOUND_EMAIL_SECRET;
if (!webhookSecret || webhookSecret === "CHANGE_ME" || webhookSecret.length < 32) {
  throw new Error(
    "INBOUND_EMAIL_SECRET must be set to at least 32 characters (openssl rand -base64 32)",
  );
}

// Hashing both sides gives equal-length buffers for timingSafeEqual.
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const expected = sha256(webhookSecret);

export const requireWebhookSecret: RequestHandler = (req, res, next) => {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!token || !timingSafeEqual(sha256(token), expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};
