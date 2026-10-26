import { MAX_EMAIL_BODY_LENGTH, MAX_EMAIL_HTML_LENGTH, MAX_EMAIL_REFERENCES, receiveEmailSchema } from "core";
import { ImapFlow } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";
import { ingestEmail } from "./ingestEmail";
import { gmailCredentials } from "./mailer";

// Senders that are machines, not customers: answering them (especially with
// an AI reply) could start an endless loop with an auto-responder.
const AUTOMATED_SENDER = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|bounces?)([+.-].*)?@/i;

// Headers that mark auto-replies ("Out of office"), bounces and mailing-list or
// marketing mail (RFC 3834 Auto-Submitted, Precedence, List-*).
function isAutomated(mail: ParsedMail) {
  const header = (name: string) => String(mail.headers.get(name) ?? "").trim().toLowerCase();
  const autoSubmitted = header("auto-submitted");
  return (
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    ["bulk", "junk", "list", "auto_reply"].includes(header("precedence")) ||
    mail.headers.has("x-autoreply") ||
    mail.headers.has("x-autorespond") ||
    mail.headers.has("list-id") ||
    mail.headers.has("list-unsubscribe")
  );
}

// Converts a parsed email into the webhook's input, or returns null (with
// the reason logged) for email that shouldn't become a ticket. Over-long
// bodies are cut to the limits instead of dropping the email.
function toReceivedEmail(mail: ParsedMail, ownAddress: string) {
  const sender = mail.from?.value[0];
  const from = sender?.address?.trim().toLowerCase();
  const label = `"${mail.subject ?? ""}" from ${from ?? "unknown sender"}`;
  if (!from) {
    console.warn(`Gmail inbox: skipped email ${label}: no sender address`);
    return null;
  }
  if (from === ownAddress || AUTOMATED_SENDER.test(from) || isAutomated(mail)) {
    console.info(`Gmail inbox: skipped automated email ${label}`);
    return null;
  }

  const references = typeof mail.references === "string" ? [mail.references] : (mail.references ?? []);
  const html = mail.html && mail.html.length <= MAX_EMAIL_HTML_LENGTH ? mail.html : undefined;
  const parsed = receiveEmailSchema.safeParse({
    from,
    fromName: sender?.name?.trim() || from.split("@")[0],
    subject: mail.subject ?? "",
    text: (mail.text ?? "").slice(0, MAX_EMAIL_BODY_LENGTH),
    html,
    messageId: mail.messageId,
    inReplyTo: mail.inReplyTo,
    references: references.slice(-MAX_EMAIL_REFERENCES),
  });
  if (!parsed.success) {
    console.warn(`Gmail inbox: skipped email ${label}: ${parsed.error.issues[0]?.message}`);
    return null;
  }
  return parsed.data;
}

// pg-boss worker for POLL_GMAIL_INBOX_QUEUE (scheduled every minute): turns
// each unread email in the Gmail inbox into a ticket or a customer reply,
// oldest first, and marks it read. Skipped email is marked read too, so it
// isn't looked at again. If storing an email fails, the poll stops and that
// email stays unread for the next poll; an email stored just before a crash
// is recognised by its Message-ID and not stored twice.
//
// Only unread email is picked up, so an email opened in Gmail before the
// next poll is not turned into a ticket.
export async function pollGmailInboxJob(signal: AbortSignal) {
  if (!gmailCredentials) return;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: gmailCredentials,
    logger: false,
  });
  // Without a listener, a dropped connection would crash the server.
  client.on("error", (err) => console.error("Gmail inbox: IMAP error:", err));
  const abort = () => client.close();
  signal.addEventListener("abort", abort, { once: true });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return;
      // Collect first: issuing commands while a fetch is still streaming deadlocks.
      const messages = await client.fetchAll(uids, { source: true }, { uid: true });
      messages.sort((a, b) => a.uid - b.uid);
      for (const message of messages) {
        if (signal.aborted) return;
        if (message.source) {
          const email = toReceivedEmail(await simpleParser(message.source), gmailCredentials.user);
          if (email) await ingestEmail(email);
        }
        await client.messageFlagsAdd([message.uid], ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await client.logout().catch(() => client.close());
  }
}
