// Admin Users page: the table of users backed by GET /api/users.
// Uses the shared admin storageState (read-only). Agent gating is in rbac.spec.ts.
import { expect, test, type Page } from "@playwright/test";
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

// Create user dialog. Each test uses a unique email (shared DB, retries).
test.describe("Create user dialog (admin)", () => {
  test.use({ storageState: ADMIN_STATE });

  const uniqueEmail = () => `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const PASSWORD = "a-valid-password-123";

  async function openDialog(page: Page) {
    await page.goto("/users");
    await page.getByRole("button", { name: "Create user" }).click();
    const dialog = page.getByRole("dialog", { name: "Create user" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("shows client-side validation messages for each field", async ({ page }) => {
    const dialog = await openDialog(page);
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByText("Name must be at least 3 characters")).toBeVisible();
    await expect(dialog.getByText("Enter a valid email address")).toBeVisible();
    await expect(dialog.getByText("Password must be at least 12 characters")).toBeVisible();
    await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog).toBeVisible();
  });

  test("creates a user, closes the dialog and shows the new row", async ({ page }) => {
    const email = uniqueEmail();
    const dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill("Ui Created User");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Password").fill(PASSWORD);

    const created = page.waitForResponse(
      (r) => r.url().endsWith("/api/users") && r.request().method() === "POST",
    );
    await dialog.getByRole("button", { name: "Create user" }).click();
    expect((await created).status()).toBe(201);

    await expect(page.getByRole("dialog")).toHaveCount(0);
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(0)).toHaveText("Ui Created User");
    await expect(row.getByRole("cell").nth(2)).toHaveText("agent");
  });

  test("shows a field error under Email for a duplicate and keeps the dialog open", async ({ page }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill("Duplicate Person");
    await dialog.getByLabel("Email").fill(agent.email);
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByText("A user with this email already exists")).toBeVisible();
    await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog).toBeVisible();
  });

  test("shows a generic alert when the server fails", async ({ page }) => {
    await page.route("**/api/users", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) })
        : route.continue(),
    );
    const dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill("Server Failure");
    await dialog.getByLabel("Email").fill(uniqueEmail());
    await dialog.getByLabel("Password").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Create user" }).click();

    await expect(dialog.getByRole("alert")).toHaveText("Failed to create user. Please try again.");
    await expect(dialog).toBeVisible();
  });

  test("cancel closes the dialog and clears the form", async ({ page }) => {
    const dialog = await openDialog(page);
    await dialog.getByLabel("Name").fill("Will Cancel");
    await dialog.getByLabel("Email").fill("bad-email");
    await dialog.getByLabel("Password").fill("x");
    await dialog.getByRole("button", { name: "Create user" }).click();
    await expect(dialog.getByText("Enter a valid email address")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "Create user" }).click();
    const reopened = page.getByRole("dialog", { name: "Create user" });
    await expect(reopened).toBeVisible();
    await expect(reopened.getByLabel("Name")).toHaveValue("");
    await expect(reopened.getByLabel("Email")).toHaveValue("");
    await expect(reopened.getByLabel("Password")).toHaveValue("");
    await expect(reopened.getByText("Enter a valid email address")).toHaveCount(0);
  });
});

// Delete user flow. Always deletes throwaway users, never the shared fixture agent.
test.describe("Delete user dialog (admin)", () => {
  test.use({ storageState: ADMIN_STATE });

  const PASSWORD = "a-valid-password-123";

  async function createUser(page: Page) {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `del-${suffix}@example.com`;
    const name = `Throwaway ${suffix}`;
    const res = await page.request.post("/api/users", { data: { name, email, password: PASSWORD } });
    expect(res.status()).toBe(201);
    return { name, email };
  }

  test("admin row has no delete button but a created agent row does", async ({ page }) => {
    const user = await createUser(page);
    await page.goto("/users");
    await expect(page.getByRole("columnheader", { name: "Actions" })).toBeAttached();

    const adminRow = page.getByRole("row").filter({ hasText: admin.email });
    await expect(adminRow).toHaveCount(1);
    await expect(adminRow.getByRole("button")).toHaveCount(0);

    const row = page.getByRole("row").filter({ hasText: user.email });
    await expect(row.getByRole("button", { name: `Delete ${user.name}` })).toBeVisible();
  });

  test("shows the confirmation dialog and Cancel keeps the row", async ({ page }) => {
    const user = await createUser(page);
    await page.goto("/users");
    const row = page.getByRole("row").filter({ hasText: user.email });
    await row.getByRole("button", { name: `Delete ${user.name}` }).click();

    const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      `${user.name} (${user.email}) will no longer be able to sign in and will be removed from the user list.`,
    );

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(row).toHaveCount(1);
  });

  test("confirming Delete closes the dialog and removes the row, even after reload", async ({ page }) => {
    const user = await createUser(page);
    await page.goto("/users");
    const row = page.getByRole("row").filter({ hasText: user.email });
    await row.getByRole("button", { name: `Delete ${user.name}` }).click();

    const deleted = page.waitForResponse(
      (r) => r.url().includes("/api/users/") && r.request().method() === "DELETE",
    );
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
    expect((await deleted).status()).toBe(204);

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(row).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: user.email })).toHaveCount(0);
  });

  test("shows a generic alert and keeps the dialog open when the server fails", async ({ page }) => {
    const user = await createUser(page);
    await page.route("**/api/users/*", (route) =>
      route.request().method() === "DELETE"
        ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) })
        : route.continue(),
    );
    await page.goto("/users");
    const row = page.getByRole("row").filter({ hasText: user.email });
    await row.getByRole("button", { name: `Delete ${user.name}` }).click();

    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Failed to delete user. Please try again.");
    await expect(dialog).toBeVisible();

    // The modal marks the page behind it aria-hidden, so close it before checking the row.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(row).toHaveCount(1);
  });
});
