import { randomUUID } from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
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

  await getTransporter(gmailCredentials).sendMail({
    from: { name: reply.senderName, address: gmailCredentials.user },
    to: { name: ticket.senderName, address: ticket.senderEmail },
    subject: /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`,
    text: reply.body,
    messageId: withAngleBrackets(messageId),
    inReplyTo: thread.length > 0 ? withAngleBrackets(thread[thread.length - 1]!) : undefined,
    references: thread.map(withAngleBrackets),
  });

  await prisma.reply.update({
    where: { id: replyId },
    data: { emailSentAt: new Date(), emailMessageId: messageId },
  });
}
