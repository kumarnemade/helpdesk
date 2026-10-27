import { randomUUID } from "node:crypto";
import nodemailer, { type SendMailOptions, type Transporter } from "nodemailer";
import { z } from "zod";
import { prisma } from "./db";

// The helpdesk's Gmail account: customers email it, the inbox poller
// (gmailInbox.ts) turns its unread emails into tickets, and agent and AI
// replies are sent from it. Optional: without both values no email is read or
// sent. The App Password is shown with spaces by Google; they're dropped.
const gmailUser = process.env.GMAIL_USER?.trim().toLowerCase() || undefined;
const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "") || undefined;

export const gmailCredentials = gmailUser && gmailAppPassword ? { user: gmailUser, pass: gmailAppPassword } : null;

export const emailConfigured = gmailCredentials !== null;

// Optional OAuth client for sending through the Gmail API over HTTPS instead
// of SMTP, for hosts that block SMTP ports (e.g. Render's free plan). The
// refresh token must be for GMAIL_USER with the gmail.send scope. Without all
// three, replies are sent over SMTP with the App Password.
const gmailApiClientId = process.env.GMAIL_CLIENT_ID?.trim() || undefined;
const gmailApiClientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() || undefined;
const gmailApiRefreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim() || undefined;

const gmailApiCredentials =
  gmailApiClientId && gmailApiClientSecret && gmailApiRefreshToken
    ? { clientId: gmailApiClientId, clientSecret: gmailApiClientSecret, refreshToken: gmailApiRefreshToken }
    : null;

export const emailSendMethod = gmailApiCredentials ? "Gmail API" : "SMTP";

// Message-ID (without angle brackets, as stored) for a reply about to be
// emailed. It's saved on the reply before sending, so the customer's answer,
// which references it, threads back onto the same ticket.
export function newOutgoingMessageId() {
  const domain = gmailUser?.split("@")[1] ?? "helpdesk.local";
  return `${randomUUID()}@${domain}`;
}

// Created on first use, so a server without Gmail settings never connects.
let transporter: Transporter | undefined;

function getTransporter(credentials: { user: string; pass: string }) {
  transporter ??= nodemailer.createTransport({ service: "gmail", auth: credentials });
  return transporter;
}

// Builds the message without sending it, for the Gmail API.
const messageBuilder = nodemailer.createTransport({ streamTransport: true, buffer: true });

const GMAIL_API_TIMEOUT_MS = 30_000;

const accessTokenResponseSchema = z.object({ access_token: z.string(), expires_in: z.number() });

// Google access tokens last about an hour; reused until a minute before expiry.
let accessToken: { value: string; expiresAt: number } | undefined;

async function getGmailAccessToken(credentials: NonNullable<typeof gmailApiCredentials>) {
  if (accessToken && accessToken.expiresAt > Date.now()) return accessToken.value;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(GMAIL_API_TIMEOUT_MS),
  });
  // Google's error body names the problem (e.g. invalid_grant for a revoked
  // or expired refresh token) and holds no secrets.
  if (!res.ok) throw new Error(`Gmail OAuth token request failed (${res.status}): ${await res.text()}`);
  const token = accessTokenResponseSchema.parse(await res.json());
  accessToken = { value: token.access_token, expiresAt: Date.now() + (token.expires_in - 60) * 1000 };
  return token.access_token;
}

async function sendWithGmailApi(credentials: NonNullable<typeof gmailApiCredentials>, mail: SendMailOptions) {
  const { message } = await messageBuilder.sendMail(mail);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await getGmailAccessToken(credentials)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: message.toString("base64url") }),
    signal: AbortSignal.timeout(GMAIL_API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Gmail API send failed (${res.status}): ${await res.text()}`);
}

// job.data comes back from the database untyped.
const sendReplyEmailJobSchema = z.object({ replyId: z.number().int().positive() });

const withAngleBrackets = (id: string) => `<${id}>`;

// pg-boss worker for SEND_REPLY_EMAIL_QUEUE: emails an agent or AI reply to
// the ticket's customer, as an answer in the same email thread (In-Reply-To
// and References list the ticket's earlier emails). A reply already sent
// (emailSentAt) is skipped, so a retry doesn't send it twice; only a crash
// between Gmail accepting the email and emailSentAt being saved can. Errors
// are thrown so pg-boss retries the job.
export async function sendReplyEmailJob(data: unknown) {
  const { replyId } = sendReplyEmailJobSchema.parse(data);
  if (!gmailCredentials) return;

  const reply = await prisma.reply.findUnique({
    where: { id: replyId },
    select: {
      body: true,
      senderType: true,
      senderName: true,
      emailMessageId: true,
      emailSentAt: true,
      ticket: {
        select: {
          subject: true,
          senderName: true,
          senderEmail: true,
          emailMessageId: true,
          replies: {
            where: { id: { lt: replyId }, emailMessageId: { not: null } },
            select: { emailMessageId: true },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
      },
    },
  });
  if (!reply || reply.emailSentAt || reply.senderType === "customer") return;

  const { ticket } = reply;
  const thread = [ticket.emailMessageId, ...ticket.replies.map((r) => r.emailMessageId)].filter(
    (id): id is string => id !== null,
  );
  const messageId = reply.emailMessageId ?? newOutgoingMessageId();

  const mail: SendMailOptions = {
    from: { name: reply.senderName, address: gmailCredentials.user },
    to: { name: ticket.senderName, address: ticket.senderEmail },
    subject: /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`,
    text: reply.body,
    messageId: withAngleBrackets(messageId),
    inReplyTo: thread.length > 0 ? withAngleBrackets(thread[thread.length - 1]!) : undefined,
    references: thread.map(withAngleBrackets),
  };
  if (gmailApiCredentials) {
    await sendWithGmailApi(gmailApiCredentials, mail);
  } else {
    await getTransporter(gmailCredentials).sendMail(mail);
  }

  await prisma.reply.update({
    where: { id: replyId },
    data: { emailSentAt: new Date(), emailMessageId: messageId },
  });
}
