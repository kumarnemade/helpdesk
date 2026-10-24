// Ticket replies against the real server: GET/POST /api/tickets/:id/replies
// (auth, selected fields, author taken from the session, trimming, status
// untouched, 400/404) plus one agent flow through the UI. Rendering and form
// states are covered by component tests. Tickets and customer replies come from
// the inbound-email webhook; every test uses unique subjects/senders because
// the suite is fullyParallel on a shared DB.
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { agent, AGENT_STATE, API_URL, INBOUND_EMAIL_SECRET } from "../fixtures/users";

const uid = () => randomUUID().slice(0, 12);

interface Created {
  id: number;
  subject: string;
  email: string;
  messageId: string;
}

function inbound(request: APIRequestContext, data: Record<string, unknown>) {
  return request.post(`${API_URL}/api/inbound-email`, {
    headers: { Authorization: `Bearer ${INBOUND_EMAIL_SECRET}` },
    data,
  });
}

async function createTicket(request: APIRequestContext, label: string): Promise<Created> {
  const id = uid();
  const subject = `${label} ${id}`;
  const email = `customer-${id}@example.com`;
  const messageId = `<${id}@mail.example.com>`;
  const res = await inbound(request, {
    from: email, fromName: `Customer ${id}`, subject, text: "Something is broken.", messageId,
  });
  expect(res.status()).toBe(201);
  return { id: (await res.json()).ticketId, subject, email, messageId };
}

// A customer reply: same sender, inReplyTo = the ticket's own Message-ID.
async function customerReply(request: APIRequestContext, t: Created, text: string) {
  const res = await inbound(request, {
    from: t.email, fromName: "Customer", subject: `Re: ${t.subject}`, text,
    messageId: `<${uid()}@mail.example.com>`, inReplyTo: t.messageId,
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).created).toBe(false);
}

const replies = (id: number | string) => `${API_URL}/api/tickets/${id}/replies`;

const REPLY_KEYS = ["author", "body", "createdAt", "id", "senderEmail", "senderName", "senderType"];

test.describe("without a session", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET and POST replies return 401", async ({ request }) => {
    expect((await request.get(replies(1))).status()).toBe(401);
    expect((await request.post(replies(1), { data: { body: "hi" } })).status()).toBe(401);
  });
});

test.describe("ticket replies API (as agent)", () => {
  test.use({ storageState: AGENT_STATE });

  test("GET returns customer and agent replies oldest first with only the selected fields", async ({ request }) => {
    const t = await createTicket(request, "Thread");
    await customerReply(request, t, "Customer follow-up");
    const posted = await request.post(replies(t.id), { data: { body: "Agent answer" } });
    expect(posted.status()).toBe(201);

    const res = await request.get(replies(t.id));
    expect(res.status()).toBe(200);
    const { replies: list } = (await res.json()) as { replies: Array<Record<string, unknown>> };

    expect(list.map((r) => [r.senderType, r.body])).toEqual([
      ["customer", "Customer follow-up"],
      ["agent", "Agent answer"],
    ]);
    for (const r of list) expect(Object.keys(r).sort()).toEqual(REPLY_KEYS);
    expect(list[0]?.author).toBeNull();
    expect(list[1]?.author).toMatchObject({ name: agent.name });
  });

  test("GET returns 404 for a missing ticket and 400 for an invalid id", async ({ request }) => {
    const missing = await request.get(replies(2147483647));
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: "Ticket not found" });

    const bad = await request.get(replies("abc"));
    expect(bad.status()).toBe(400);
    expect(await bad.json()).toEqual({ error: "Invalid ticket id" });
  });

  test("POST creates an agent reply from the session user, ignoring other body fields, and trims the body", async ({
    request,
  }) => {
    const t = await createTicket(request, "Post reply");
    const res = await request.post(replies(t.id), {
      data: {
        body: "  Thanks, we are on it.  ",
        senderName: "Mallory",
        senderEmail: "mallory@evil.example.com",
        authorId: "someone-else",
        senderType: "customer",
      },
    });
    expect(res.status()).toBe(201);
    const { reply } = await res.json();
    expect(reply).toMatchObject({
      body: "Thanks, we are on it.",
      senderType: "agent",
      senderName: agent.name,
      senderEmail: agent.email,
      author: { name: agent.name },
    });
    expect(Object.keys(reply).sort()).toEqual(REPLY_KEYS);

    // Replying doesn't change the ticket status.
    const detail = await (await request.get(`${API_URL}/api/tickets/${t.id}`)).json();
    expect(detail.ticket.status).toBe("new");
  });

  test("POST rejects a whitespace-only body with 400 and a missing ticket with 404", async ({ request }) => {
    const t = await createTicket(request, "Post errors");
    const empty = await request.post(replies(t.id), { data: { body: "   " } });
    expect(empty.status()).toBe(400);
    expect(await empty.json()).toEqual({ error: "Reply cannot be empty" });

    const missing = await request.post(replies(2147483647), { data: { body: "hello" } });
    expect(missing.status()).toBe(404);
    expect(await missing.json()).toEqual({ error: "Ticket not found" });
  });
});

test.describe("replying to a ticket (agent flow)", () => {
  test.use({ storageState: AGENT_STATE });

  test("opens a ticket from the list, sends a reply, and it persists after reload", async ({ page, request }) => {
    const t = await createTicket(request, "Flow");
    await customerReply(request, t, "Any update on this?");
    const text = `We are looking into it ${uid()}`;

    await page.goto(`/tickets?search=${encodeURIComponent(t.subject)}`);
    await page.getByRole("link", { name: t.subject }).click();
    await expect(page).toHaveURL(new RegExp(`/tickets/${t.id}$`));
    await expect(page.getByRole("heading", { name: t.subject })).toBeVisible();

    const region = page.getByRole("region", { name: "Replies" });
    await expect(region.getByText("Any update on this?")).toBeVisible();

    const box = region.getByRole("textbox", { name: "Reply" });
    await box.fill(text);
    await region.getByRole("button", { name: "Send reply" }).click();

    const sent = region.getByRole("listitem").filter({ hasText: text });
    await expect(sent).toBeVisible();
    await expect(sent.getByText("Agent", { exact: true })).toBeVisible();
    await expect(sent.getByText(agent.name).first()).toBeVisible();
    await expect(box).toHaveValue("");

    await page.reload();
    await expect(page.getByRole("region", { name: "Replies" }).getByText(text)).toBeVisible();
  });
});
