// Ticket list (/tickets and GET /api/tickets). Tickets only come from the inbound
// webhook, so each test creates its own tickets with unique subjects and senders.
// The suite is fullyParallel on a shared DB, so assertions only look at OUR
// tickets (never absolute counts or row positions).
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN_STATE, AGENT_STATE, API_URL, INBOUND_EMAIL_SECRET } from "../fixtures/users";

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
    const first = await createTicket(request, "Older ticket");
    const second = await createTicket(request, "Newer ticket");

    await page.goto("/tickets");
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
    await page.goto("/tickets");
    await expect(page).toHaveURL("/tickets");
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
        const first = await createTicket(request, "API older");
        const second = await createTicket(request, "API newer");

        const res = await request.get(`${API_URL}/api/tickets`);
        expect(res.status()).toBe(200);
        const { tickets } = (await res.json()) as { tickets: Array<Record<string, unknown>> };

        const ids = tickets.map((t) => t.id);
        expect(ids).toContain(first.id);
        expect(ids).toContain(second.id);
        expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));

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

    await page.goto("/tickets");

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

test.describe("Unauthenticated access", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects /tickets to /login", async ({ page }) => {
    await page.goto("/tickets");
    await expect(page).toHaveURL(/\/login/);
  });
});
