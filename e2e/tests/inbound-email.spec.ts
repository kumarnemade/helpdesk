// API-level tests for POST /api/inbound-email (no browser UI). Every test uses
// unique sender addresses and Message-IDs because the suite is fullyParallel
// and shares one database.
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { API_URL, INBOUND_EMAIL_SECRET } from "../fixtures/users";

const URL = `${API_URL}/api/inbound-email`;
const uid = () => randomUUID().slice(0, 12);

function newEmail(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    from: `customer-${id}@example.com`,
    fromName: "Test Customer",
    subject: `Help ${id}`,
    text: "Something is broken.",
    messageId: `<${id}@mail.example.com>`,
    ...overrides,
  };
}

function send(
  request: APIRequestContext,
  data: Record<string, unknown>,
  headers: Record<string, string> = { Authorization: `Bearer ${INBOUND_EMAIL_SECRET}` },
) {
  return request.post(URL, { data, headers });
}

test.describe("POST /api/inbound-email", () => {
  test("creates a ticket from a valid email", async ({ request }) => {
    const res = await send(request, newEmail());
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(typeof body.ticketId).toBe("number");
  });

  test("accepts an email with no subject and no messageId", async ({ request }) => {
    const email = newEmail();
    delete (email as Record<string, unknown>).subject;
    delete (email as Record<string, unknown>).messageId;
    const res = await send(request, email);
    expect(res.status()).toBe(201);
    expect((await res.json()).created).toBe(true);
  });

  test("accepts an email with an html body", async ({ request }) => {
    const res = await send(request, newEmail({ html: "<p>Something is <b>broken</b>.</p>" }));
    expect(res.status()).toBe(201);
  });

  test("treats the same messageId sent twice as a duplicate", async ({ request }) => {
    const email = newEmail();
    const first = await (await send(request, email)).json();
    const res = await send(request, email);
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ticketId: first.ticketId, created: false });
  });

  test("treats <id> and id as the same messageId", async ({ request }) => {
    const id = `${uid()}@mail.example.com`;
    const first = await (await send(request, newEmail({ messageId: `<${id}>` }))).json();
    const res = await send(request, newEmail({ messageId: id }));
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ticketId: first.ticketId, created: false });
  });

  test("threads a reply from the same sender onto the ticket", async ({ request }) => {
    const email = newEmail();
    const first = await (await send(request, email)).json();
    const res = await send(
      request,
      newEmail({
        from: email.from.toUpperCase(),
        inReplyTo: email.messageId,
      }),
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ticketId: first.ticketId, created: false });
  });

  test("threads an email whose references point at an earlier reply", async ({ request }) => {
    const email = newEmail();
    const first = await (await send(request, email)).json();
    const reply = newEmail({ from: email.from, inReplyTo: email.messageId });
    expect((await send(request, reply)).status()).toBe(200);

    const res = await send(
      request,
      newEmail({ from: email.from, references: [reply.messageId] }),
    );
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ticketId: first.ticketId, created: false });
  });

  test("creates a new ticket when a different sender cites the messageId", async ({ request }) => {
    const email = newEmail();
    const first = await (await send(request, email)).json();
    const res = await send(request, newEmail({ inReplyTo: email.messageId }));
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.ticketId).not.toBe(first.ticketId);
  });

  test.describe("authentication", () => {
    test("rejects a request without an Authorization header", async ({ request }) => {
      const res = await send(request, newEmail(), {});
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    test("rejects a wrong secret", async ({ request }) => {
      const res = await send(request, newEmail(), { Authorization: "Bearer wrong-secret" });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });

    test("rejects a non-Bearer scheme", async ({ request }) => {
      const res = await send(request, newEmail(), {
        Authorization: `Basic ${INBOUND_EMAIL_SECRET}`,
      });
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  });

  test.describe("validation", () => {
    test("rejects a missing fromName", async ({ request }) => {
      const email = newEmail();
      delete (email as Record<string, unknown>).fromName;
      const res = await send(request, email);
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Sender name is required" });
    });

    test("rejects an invalid from address", async ({ request }) => {
      const res = await send(request, newEmail({ from: "not-an-email" }));
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Enter a valid sender email address" });
    });

    test("rejects an empty text body", async ({ request }) => {
      const res = await send(request, newEmail({ text: "" }));
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Email body is required" });
    });

    test("rejects more than 100 references", async ({ request }) => {
      const references = Array.from({ length: 101 }, (_, i) => `<ref-${i}-${uid()}@x.com>`);
      const res = await send(request, newEmail({ references }));
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "At most 100 references are allowed" });
    });
  });
});
