// Ticket list (/tickets and GET /api/tickets). Tickets only come from the inbound
// webhook, so each test creates its own tickets with unique subjects and senders.
// The suite is fullyParallel on a shared DB, so assertions only look at OUR
// tickets (never absolute counts or row positions).
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { admin, ADMIN_STATE, agent, AGENT_STATE, API_URL, INBOUND_EMAIL_SECRET } from "../fixtures/users";

const uid = () => randomUUID().slice(0, 12);

interface Created {
  id: number;
  subject: string;
  name: string;
  email: string;
}

async function createTicket(request: APIRequestContext, label: string): Promise<Created> {
  const id = uid();
  const subject = `${label} ${id}`;
  const name = `Customer ${id}`;
  const email = `customer-${id}@example.com`;
  const res = await request.post(`${API_URL}/api/inbound-email`, {
    headers: { Authorization: `Bearer ${INBOUND_EMAIL_SECRET}` },
    data: { from: email, fromName: name, subject, text: "Something is broken.", messageId: `<${id}@mail.example.com>` },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  return { id: body.ticketId, subject, name, email };
}

// Index of the table row containing `subject` among all rows on the page.
async function rowIndex(page: Page, subject: string) {
  const rows = await page.getByRole("row").allInnerTexts();
  return rows.findIndex((t) => t.includes(subject));
}

test.describe("Tickets page as admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("lists tickets newest first with sender, status, category and assignee", async ({ page, request }) => {
    // The list is paginated, so search for our own tickets by a shared prefix.
    const prefix = `List${uid()}`;
    const first = await createTicket(request, `${prefix} Older ticket`);
    const second = await createTicket(request, `${prefix} Newer ticket`);

    await page.goto(`/tickets?search=${prefix}`);
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
    await expect(page.getByText("Support requests received by email. Click a column heading to sort.")).toBeVisible();

    for (const t of [first, second]) {
      const row = page.getByRole("row").filter({ hasText: t.subject });
      await expect(row).toBeVisible();
      await expect(row.getByText(t.name)).toBeVisible();
      await expect(row.getByText(t.email)).toBeVisible();
      await expect(row.getByText("New", { exact: true })).toBeVisible();
      await expect(row.getByText("—")).toBeVisible();
      await expect(row.getByText("Unassigned")).toBeVisible();
    }

    const olderIdx = await rowIndex(page, first.subject);
    const newerIdx = await rowIndex(page, second.subject);
    expect(olderIdx).toBeGreaterThan(0);
    expect(newerIdx).toBeGreaterThan(0);
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  test("shows the column headers", async ({ page }) => {
    await page.goto("/tickets");
    for (const name of ["Subject", "From", "Status", "Category", "Assigned to", "Received"]) {
      await expect(page.getByRole("columnheader", { name })).toBeVisible();
    }
  });

  test("shows an error alert when the API fails", async ({ page }) => {
    await page.route("**/api/tickets?*", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) }),
    );
    await page.goto("/tickets");
    await expect(page.getByRole("alert").filter({ hasText: "Failed to load tickets" })).toBeVisible();
  });
});

test.describe("Tickets page as agent", () => {
  test.use({ storageState: AGENT_STATE });

  test("can open /tickets and see a ticket", async ({ page, request }) => {
    const t = await createTicket(request, "Agent visible");
    await page.goto(`/tickets?search=${encodeURIComponent(t.subject)}`);
    await expect(page).toHaveURL(/\/tickets\?search=/);
    await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: t.subject });
    await expect(row).toBeVisible();
    await expect(row.getByText(t.email)).toBeVisible();
  });
});

test.describe("Tickets nav link", () => {
  for (const [role, state] of [
    ["admin", ADMIN_STATE],
    ["agent", AGENT_STATE],
  ] as const) {
    test.describe(role, () => {
      test.use({ storageState: state });

      test(`is visible to the ${role} and navigates to /tickets`, async ({ page }) => {
        await page.goto("/");
        const link = page.getByRole("navigation").getByRole("link", { name: "Tickets" });
        await expect(link).toBeVisible();
        await link.click();
        await expect(page).toHaveURL("/tickets");
        await expect(page.getByRole("heading", { name: "Tickets" })).toBeVisible();
      });
    });
  }
});

test.describe("GET /api/tickets", () => {
  test.describe("without a session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401", async ({ request }) => {
      const res = await request.get(`${API_URL}/api/tickets`);
      expect(res.status()).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    });
  });

  for (const [role, state] of [
    ["admin", ADMIN_STATE],
    ["agent", AGENT_STATE],
  ] as const) {
    test.describe(role, () => {
      test.use({ storageState: state });

      test(`returns tickets newest first without body fields for the ${role}`, async ({ request }) => {
        const prefix = `Api${uid()}`;
        const first = await createTicket(request, `${prefix} older`);
        const second = await createTicket(request, `${prefix} newer`);

        // Paginated, so scope to our own tickets with a search.
        const res = await request.get(`${API_URL}/api/tickets?search=${prefix}`);
        expect(res.status()).toBe(200);
        const { tickets, total } = (await res.json()) as { tickets: Array<Record<string, unknown>>; total: number };

        expect(total).toBe(2);
        expect(tickets.map((t) => t.id)).toEqual([second.id, first.id]);

        const mine = tickets.find((t) => t.id === second.id)!;
        expect(mine).toMatchObject({
          subject: second.subject,
          status: "new",
          category: null,
          senderName: second.name,
          senderEmail: second.email,
          assignedTo: null,
        });
        for (const t of tickets) {
          expect(t).not.toHaveProperty("body");
          expect(t).not.toHaveProperty("bodyHtml");
          expect(t).not.toHaveProperty("emailMessageId");
        }
      });
    });
  }
});

// Server-side sorting. Subjects share a unique prefix so we can filter to our own
// rows; the assertions only check the relative order of those rows.
test.describe("Ticket sorting", () => {
  test.use({ storageState: ADMIN_STATE });

  test("sorts by column via header buttons and exposes aria-sort", async ({ page, request }) => {
    const prefix = `Sort${uid()}`;
    // Created in non-alphabetical order: Banana, Cherry, Apple (Apple is newest).
    await createTicket(request, `${prefix} Banana`);
    await createTicket(request, `${prefix} Cherry`);
    await createTicket(request, `${prefix} Apple`);

    const mine = page.getByRole("row").filter({ hasText: prefix });
    const subjectHeader = page.getByRole("columnheader", { name: "Subject" });
    const receivedHeader = page.getByRole("columnheader", { name: "Received" });

    await page.goto(`/tickets?search=${prefix}`);

    // Default: newest first, Received descending.
    await expect(mine).toHaveCount(3);
    await expect(mine).toContainText(["Apple", "Cherry", "Banana"]);
    await expect(receivedHeader).toHaveAttribute("aria-sort", "descending");
    await expect(subjectHeader).toHaveAttribute("aria-sort", "none");

    // First click: ascending (A -> Z).
    const asc = page.waitForResponse(
      (r) => r.url().includes("/api/tickets") && r.url().includes("sortBy=subject") && r.url().includes("sortOrder=asc"),
    );
    await subjectHeader.getByRole("button", { name: "Subject" }).click();
    await asc;
    await expect(subjectHeader).toHaveAttribute("aria-sort", "ascending");
    await expect(mine).toContainText(["Apple", "Banana", "Cherry"]);
    await expect(receivedHeader).toHaveAttribute("aria-sort", "none");

    // Second click: descending (Z -> A).
    const desc = page.waitForResponse(
      (r) => r.url().includes("/api/tickets") && r.url().includes("sortBy=subject") && r.url().includes("sortOrder=desc"),
    );
    await subjectHeader.getByRole("button", { name: "Subject" }).click();
    await desc;
    await expect(subjectHeader).toHaveAttribute("aria-sort", "descending");
    await expect(mine).toContainText(["Cherry", "Banana", "Apple"]);
  });

  test("GET /api/tickets rejects an invalid sort field with 400", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/tickets?sortBy=bogus`);
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid sort field" });
  });
});

// Server-side filtering. Webhook tickets are always new and uncategorised, so
// ours must match those filters and be excluded by any other value.
test.describe("Ticket filtering (GET /api/tickets)", () => {
  test.use({ storageState: ADMIN_STATE });

  async function list(request: APIRequestContext, query: string) {
    const res = await request.get(`${API_URL}/api/tickets?${query}`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as { tickets: Array<{ id: number; status: string; category: string | null }> })
      .tickets;
  }

  test("filters by status and category, with category=none for uncategorised", async ({ request }) => {
    const mine = await createTicket(request, "Filter target");

    const newUncategorised = await list(request, `search=${encodeURIComponent(mine.subject)}&status=new&category=none`);
    expect(newUncategorised.map((t) => t.id)).toContain(mine.id);
    for (const t of newUncategorised) expect(t).toMatchObject({ status: "new", category: null });

    const closed = await list(request, "status=closed");
    expect(closed.map((t) => t.id)).not.toContain(mine.id);
    for (const t of closed) expect(t.status).toBe("closed");

    const refunds = await list(request, "category=refund_request");
    expect(refunds.map((t) => t.id)).not.toContain(mine.id);
    for (const t of refunds) expect(t.category).toBe("refund_request");
  });

  test("searches subject, sender name and sender email case-insensitively", async ({ request }) => {
    const mine = await createTicket(request, "Searchable Invoice");
    const id = mine.subject.split(" ").at(-1)!;
    const ids = async (search: string) =>
      (await list(request, `search=${encodeURIComponent(search)}`)).map((t) => t.id);

    // Subject, in a different case.
    expect(await ids(`SEARCHABLE INVOICE ${id.toUpperCase()}`)).toContain(mine.id);
    // Sender name ("Customer <id>") and sender email ("customer-<id>@example.com").
    expect(await ids(mine.name.toLowerCase())).toContain(mine.id);
    expect(await ids(mine.email.toUpperCase())).toContain(mine.id);
    // Combined with a filter it can't match.
    expect((await list(request, `search=${id}&status=closed`)).map((t) => t.id)).not.toContain(mine.id);
    // LIKE wildcards are literal: "%" doesn't match everything.
    expect(await ids(`${id}%`)).not.toContain(mine.id);
  });

  test("rejects a search longer than 200 characters with 400", async ({ request }) => {
    const res = await request.get(`${API_URL}/api/tickets?search=${"a".repeat(201)}`);
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Search must be at most 200 characters" });
  });

  test("rejects invalid filter values with 400", async ({ request }) => {
    const status = await request.get(`${API_URL}/api/tickets?status=bogus`);
    expect(status.status()).toBe(400);
    expect(await status.json()).toEqual({ error: "Invalid status filter" });

    const category = await request.get(`${API_URL}/api/tickets?category=spam`);
    expect(category.status()).toBe(400);
    expect(await category.json()).toEqual({ error: "Invalid category filter" });
  });
});

// Server-side pagination. 11 tickets with a shared prefix span two pages of 10
// (the smallest page size); searching for the prefix scopes the list to them.
test.describe("Ticket pagination (GET /api/tickets)", () => {
  test.use({ storageState: ADMIN_STATE });

  test("returns pages of tickets with the matching total and no overlap", async ({ request }) => {
    const prefix = `Page${uid()}`;
    const created: number[] = [];
    for (let i = 0; i < 11; i++) created.push((await createTicket(request, `${prefix} ${i}`)).id);

    const page = async (query: string) => {
      const res = await request.get(`${API_URL}/api/tickets?search=${prefix}&${query}`);
      expect(res.status()).toBe(200);
      return (await res.json()) as { tickets: Array<{ id: number }>; total: number };
    };

    // Default page size is 10, newest first.
    const first = await page("");
    const second = await page("page=2");
    expect(first.total).toBe(11);
    expect(second.total).toBe(11);
    expect(first.tickets).toHaveLength(10);
    expect(second.tickets).toHaveLength(1);
    expect([...first.tickets, ...second.tickets].map((t) => t.id)).toEqual([...created].reverse());

    // A bigger page holds them all; a page past the end is empty but keeps the total.
    expect((await page("pageSize=25")).tickets).toHaveLength(11);
    const past = await page("page=3");
    expect(past).toEqual({ tickets: [], total: 11 });
  });

  test("rejects invalid page and page size values with 400", async ({ request }) => {
    for (const [query, error] of [
      ["page=0", "Page must be at least 1"],
      ["page=abc", "Page must be a number"],
      ["pageSize=7", "Page size must be one of 10, 25, 50"],
    ]) {
      const res = await request.get(`${API_URL}/api/tickets?${query}`);
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
  });
});

// Ticket details: the opening email's plain-text body, but never the sender's
// HTML, the email Message-ID or replies.
test.describe("GET /api/tickets/:id", () => {
  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });

    test("returns the ticket with its body, without HTML, Message-ID or replies", async ({ request }) => {
      const t = await createTicket(request, "Detail");

      const res = await request.get(`${API_URL}/api/tickets/${t.id}`);
      expect(res.status()).toBe(200);
      const { ticket } = await res.json();

      expect(ticket).toMatchObject({
        id: t.id,
        subject: t.subject,
        status: "new",
        category: null,
        senderName: t.name,
        senderEmail: t.email,
        assignedTo: null,
        body: "Something is broken.",
      });
      expect(ticket).not.toHaveProperty("bodyHtml");
      expect(ticket).not.toHaveProperty("emailMessageId");
      expect(ticket).not.toHaveProperty("replies");
    });

    test("returns 404 for a missing ticket and 400 for an invalid id", async ({ request }) => {
      const missing = await request.get(`${API_URL}/api/tickets/2147483647`);
      expect(missing.status()).toBe(404);
      expect(await missing.json()).toEqual({ error: "Ticket not found" });

      for (const id of ["abc", "0", "1.5"]) {
        const res = await request.get(`${API_URL}/api/tickets/${id}`);
        expect(res.status()).toBe(400);
        expect(await res.json()).toEqual({ error: "Invalid ticket id" });
      }
    });
  });

  test.describe("without a session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401", async ({ request }) => {
      const res = await request.get(`${API_URL}/api/tickets/1`);
      expect(res.status()).toBe(401);
    });
  });
});

// Assigning tickets: real users, soft deletion and the shared DB, so only the
// server can prove it. Admins and agents can both assign.
test.describe("Ticket assignment", () => {
  type Assignee = { id: string; name: string };

  async function assignees(request: APIRequestContext) {
    const res = await request.get(`${API_URL}/api/tickets/assignees`);
    expect(res.status()).toBe(200);
    return ((await res.json()) as { users: Assignee[] }).users;
  }

  function assign(request: APIRequestContext, ticketId: number | string, assignedToId: unknown) {
    return request.patch(`${API_URL}/api/tickets/${ticketId}`, { data: { assignedToId } });
  }

  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });

    test("assigns a ticket to an admin or agent and unassigns it", async ({ request }) => {
      const t = await createTicket(request, "Assign me");
      const users = await assignees(request);
      const adminUser = users.find((u) => u.name === admin.name)!;
      const agentUser = users.find((u) => u.name === agent.name)!;
      expect(adminUser).toBeDefined();
      expect(agentUser).toBeDefined();

      const toAgent = await assign(request, t.id, agentUser.id);
      expect(toAgent.status()).toBe(200);
      expect((await toAgent.json()).ticket).toMatchObject({ id: t.id, assignedTo: agentUser, body: "Something is broken." });

      const toAdmin = await assign(request, t.id, adminUser.id);
      expect((await toAdmin.json()).ticket.assignedTo).toEqual(adminUser);

      // The list and the detail endpoint both reflect it.
      const list = await (await request.get(`${API_URL}/api/tickets?search=${encodeURIComponent(t.subject)}`)).json();
      expect(list.tickets[0].assignedTo).toEqual(adminUser);

      const unassign = await assign(request, t.id, null);
      expect(unassign.status()).toBe(200);
      const detail = await (await request.get(`${API_URL}/api/tickets/${t.id}`)).json();
      expect(detail.ticket.assignedTo).toBeNull();
    });

    test("rejects unknown assignees, bad bodies, invalid ids and missing tickets", async ({ request }) => {
      const t = await createTicket(request, "Assign errors");

      for (const [body, error] of [
        [{ assignedToId: "no-such-user" }, "Assignee not found"],
        [{ assignedToId: "" }, "Choose an assignee or Unassigned"],
        [{}, "Nothing to update"],
      ] as const) {
        const res = await request.patch(`${API_URL}/api/tickets/${t.id}`, { data: body });
        expect(res.status()).toBe(400);
        expect(await res.json()).toEqual({ error });
      }

      const badId = await assign(request, "abc", null);
      expect(badId.status()).toBe(400);
      expect(await badId.json()).toEqual({ error: "Invalid ticket id" });

      const missing = await assign(request, 2147483647, null);
      expect(missing.status()).toBe(404);
      expect(await missing.json()).toEqual({ error: "Ticket not found" });
    });
  });

  test.describe("deleted users (as admin)", () => {
    test.use({ storageState: ADMIN_STATE });

    test("are not listed and can't be assigned", async ({ request }) => {
      const t = await createTicket(request, "Assign deleted");
      const created = await request.post(`${API_URL}/api/users`, {
        data: { name: `Leaver ${uid()}`, email: `leaver-${uid()}@example.com`, password: "a-valid-password-123" },
      });
      expect(created.status()).toBe(201);
      const { user } = (await created.json()) as { user: Assignee };
      expect((await assignees(request)).map((u) => u.id)).toContain(user.id);

      const deleted = await request.delete(`${API_URL}/api/users/${user.id}`);
      expect(deleted.ok()).toBe(true);

      expect((await assignees(request)).map((u) => u.id)).not.toContain(user.id);
      const res = await assign(request, t.id, user.id);
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Assignee not found" });
    });
  });

  test.describe("without a session", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("returns 401 for the assignees list and for assigning", async ({ request }) => {
      expect((await request.get(`${API_URL}/api/tickets/assignees`)).status()).toBe(401);
      expect((await assign(request, 1, null)).status()).toBe(401);
    });
  });
});

// Changing status and category (PATCH is a partial update: fields not sent
// stay as they are).
test.describe("Ticket status and category updates", () => {
  test.use({ storageState: AGENT_STATE });

  function update(request: APIRequestContext, ticketId: number, data: unknown) {
    return request.patch(`${API_URL}/api/tickets/${ticketId}`, { data });
  }

  test("changes status and category, sets the category back to none, and updates several fields at once", async ({
    request,
  }) => {
    const t = await createTicket(request, "Status category");

    const open = await update(request, t.id, { status: "open" });
    expect(open.status()).toBe(200);
    expect((await open.json()).ticket).toMatchObject({ status: "open", category: null, assignedTo: null });

    const categorised = await update(request, t.id, { category: "technical_question" });
    expect((await categorised.json()).ticket).toMatchObject({ status: "open", category: "technical_question" });

    // The list's filters see the change.
    const filtered = await (
      await request.get(
        `${API_URL}/api/tickets?search=${encodeURIComponent(t.subject)}&status=open&category=technical_question`,
      )
    ).json();
    expect(filtered.tickets.map((x: { id: number }) => x.id)).toEqual([t.id]);

    const cleared = await update(request, t.id, { category: null });
    expect((await cleared.json()).ticket.category).toBeNull();

    const both = await update(request, t.id, { status: "resolved", category: "refund_request" });
    expect((await both.json()).ticket).toMatchObject({ status: "resolved", category: "refund_request" });

    const detail = await (await request.get(`${API_URL}/api/tickets/${t.id}`)).json();
    expect(detail.ticket).toMatchObject({ status: "resolved", category: "refund_request", assignedTo: null });
  });

  test("rejects invalid status and category values with 400", async ({ request }) => {
    const t = await createTicket(request, "Status invalid");

    for (const [body, error] of [
      [{ status: "done" }, "Invalid status"],
      [{ status: null }, "Invalid status"],
      [{ category: "spam" }, "Invalid category"],
      [{}, "Nothing to update"],
    ] as const) {
      const res = await update(request, t.id, body);
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error });
    }

    // Nothing changed.
    const detail = await (await request.get(`${API_URL}/api/tickets/${t.id}`)).json();
    expect(detail.ticket).toMatchObject({ status: "new", category: null });
  });
});

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects /tickets to /login", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});
