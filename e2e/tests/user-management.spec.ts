// Admin user management, HAPPY PATHS ONLY: create, read/list, delete.
// Errors, validation and permissions are covered in users.spec.ts and api.spec.ts.
// TODO: add update tests when editing users is built (the edit user API endpoint
// is still unticked in implementation-plan.md).
// Every test creates throwaway users with unique emails and never touches the
// shared fixture admin/agent, which other tests and the storage states rely on.
import { expect, test, type Page } from "@playwright/test";
import { admin, ADMIN_STATE, agent } from "../fixtures/users";

const PASSWORD = "a-valid-password-123";

function makeUser(label: string) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { name: `${label} ${suffix}`, email: `mgmt-${suffix}@example.com`, password: PASSWORD };
}

async function createViaDialog(page: Page, user: { name: string; email: string; password: string }) {
  await page.getByRole("button", { name: "Create user" }).click();
  const dialog = page.getByRole("dialog", { name: "Create user" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Name").fill(user.name);
  await dialog.getByLabel("Email").fill(user.email);
  await dialog.getByLabel("Password").fill(user.password);
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/users") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Create user" }).click();
  expect((await created).status()).toBe(201);
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function deleteViaDialog(page: Page, user: { name: string }) {
  await page.getByRole("button", { name: `Delete ${user.name}` }).click();
  const dialog = page.getByRole("alertdialog", { name: "Delete user?" });
  await expect(dialog).toBeVisible();
  const deleted = page.waitForResponse(
    (r) => r.url().includes("/api/users/") && r.request().method() === "DELETE",
  );
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await deleted).status()).toBe(204);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test.describe("User management UI (admin happy paths)", () => {
  test.use({ storageState: ADMIN_STATE });

  test("admin opens Users from the nav and sees the table with the fixture users", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL(/\/users$/);

    for (const name of ["Name", "Email", "Role", "Created"]) {
      await expect(page.getByRole("columnheader", { name })).toBeVisible();
    }
    for (const [u, role] of [[admin, "admin"], [agent, "agent"]] as const) {
      const row = page.getByRole("row").filter({ hasText: u.email });
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("cell").nth(0)).toHaveText(u.name);
      await expect(row.getByRole("cell").nth(1)).toHaveText(u.email);
      await expect(row.getByRole("cell").nth(2)).toHaveText(role);
    }
  });

  test("creates a user through the dialog; the row persists after reload", async ({ page }) => {
    const user = makeUser("Created");
    await page.goto("/users");
    await createViaDialog(page, user);

    const row = page.getByRole("row").filter({ hasText: user.email });
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("cell").nth(0)).toHaveText(user.name);
    await expect(row.getByRole("cell").nth(2)).toHaveText("agent");

    await page.reload();
    const reloaded = page.getByRole("row").filter({ hasText: user.email });
    await expect(reloaded).toHaveCount(1);
    await expect(reloaded.getByRole("cell").nth(2)).toHaveText("agent");
  });

  test("deletes a user through the confirmation dialog; the row stays gone after reload", async ({ page }) => {
    const user = makeUser("Deleted");
    await page.goto("/users");
    await createViaDialog(page, user);
    await expect(page.getByRole("row").filter({ hasText: user.email })).toHaveCount(1);

    await deleteViaDialog(page, user);
    await expect(page.getByRole("row").filter({ hasText: user.email })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: admin.email })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: user.email })).toHaveCount(0);
  });

  test("lifecycle: create, new user signs in, admin deletes, deleted user cannot sign in", async ({ page, browser }) => {
    const user = makeUser("Lifecycle");
    await page.goto("/users");
    await createViaDialog(page, user);

    // The new user can sign in right away, in a fresh unauthenticated context.
    const userCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const userPage = await userCtx.newPage();
      await userPage.goto("/login");
      await userPage.getByLabel("Email").fill(user.email);
      await userPage.getByLabel("Password").fill(user.password);
      await userPage.getByRole("button", { name: "Sign in" }).click();
      await expect(userPage).toHaveURL("/");
      await expect(userPage.getByRole("heading", { name: `Welcome, ${user.name}` })).toBeVisible();
    } finally {
      await userCtx.close();
    }

    // Back as admin: delete the user.
    await deleteViaDialog(page, user);
    await expect(page.getByRole("row").filter({ hasText: user.email })).toHaveCount(0);

    // The deleted user is rejected at sign-in.
    const deletedCtx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const deletedPage = await deletedCtx.newPage();
      await deletedPage.goto("/login");
      await deletedPage.getByLabel("Email").fill(user.email);
      await deletedPage.getByLabel("Password").fill(user.password);
      await deletedPage.getByRole("button", { name: "Sign in" }).click();
      await expect(deletedPage.getByRole("alert")).toBeVisible();
      await expect(deletedPage).toHaveURL(/\/login$/);
    } finally {
      await deletedCtx.close();
    }
  });
});

test.describe("User management API (admin happy paths)", () => {
  test.use({ storageState: ADMIN_STATE });

  type ApiUser = { id: string; name: string; email: string; role: string; createdAt: string };

  test("GET /api/users lists the fixture users", async ({ request }) => {
    const res = await request.get("/api/users");
    expect(res.status()).toBe(200);
    const { users } = (await res.json()) as { users: ApiUser[] };
    expect(users.find((u) => u.email === admin.email)).toMatchObject({ role: "admin", name: admin.name });
    expect(users.find((u) => u.email === agent.email)).toMatchObject({ role: "agent", name: agent.name });
  });

  test("POST /api/users returns 201 and the user appears in GET", async ({ request }) => {
    const user = makeUser("ApiCreated");
    const res = await request.post("/api/users", { data: user });
    expect(res.status()).toBe(201);
    const { user: created } = (await res.json()) as { user: ApiUser };
    expect(created).toMatchObject({ name: user.name, email: user.email, role: "agent" });

    const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
    expect(users.find((u) => u.id === created.id)).toMatchObject({ email: user.email, role: "agent" });

    // Clean up the throwaway user.
    expect((await request.delete(`/api/users/${created.id}`)).status()).toBe(204);
  });

  test("DELETE /api/users/:id returns 204 and the user disappears from GET", async ({ request }) => {
    const user = makeUser("ApiDeleted");
    const created = ((await (await request.post("/api/users", { data: user })).json()) as { user: ApiUser }).user;

    const res = await request.delete(`/api/users/${created.id}`);
    expect(res.status()).toBe(204);

    const { users } = (await (await request.get("/api/users")).json()) as { users: ApiUser[] };
    expect(users.some((u) => u.id === created.id)).toBe(false);
  });
});
