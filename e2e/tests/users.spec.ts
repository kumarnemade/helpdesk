// Admin Users page: the table of users backed by GET /api/users.
// Uses the shared admin storageState (read-only). Agent gating is in rbac.spec.ts.
import { expect, test } from "@playwright/test";
import { admin, ADMIN_STATE, agent } from "../fixtures/users";

test.describe("Users page (admin)", () => {
  test.use({ storageState: ADMIN_STATE });

  test("shows the table with column headers and a row per seeded user", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

    for (const name of ["Name", "Email", "Role", "Created"]) {
      await expect(page.getByRole("columnheader", { name })).toBeVisible();
    }

    const adminRow = page.getByRole("row").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await expect(adminRow.getByRole("cell").nth(0)).toHaveText(admin.name);
    await expect(adminRow.getByRole("cell").nth(1)).toHaveText(admin.email);
    await expect(adminRow.getByRole("cell").nth(2)).toHaveText("admin");

    const agentRow = page.getByRole("row").filter({ hasText: agent.email });
    await expect(agentRow).toHaveCount(1);
    await expect(agentRow.getByRole("cell").nth(0)).toHaveText(agent.name);
    await expect(agentRow.getByRole("cell").nth(1)).toHaveText(agent.email);
    await expect(agentRow.getByRole("cell").nth(2)).toHaveText("agent");

    await expect(page.getByText("Loading users…")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("shows a loading row while the request is pending", async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    await page.route("**/api/users", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto("/users");
    await expect(page.getByText("Loading users…")).toBeVisible();
    release();
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
    await expect(page.getByText("Loading users…")).toHaveCount(0);
  });

  test("shows an error alert when the API returns 500", async ({ page }) => {
    await page.route("**/api/users", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) }),
    );
    await page.goto("/users");
    await expect(page.getByRole("alert")).toHaveText("Failed to load users. Please try again.");
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toHaveCount(0);
  });

  test("shows the empty state when the API returns no users", async ({ page }) => {
    await page.route("**/api/users", (route) => route.fulfill({ json: { users: [] } }));
    await page.goto("/users");
    await expect(page.getByText("No users found.")).toBeVisible();
  });
});
