// One critical multi-page flow against the real server: an admin creates a user
// through the dialog, the new user signs in, the admin deletes them, and the
// deleted user can no longer sign in. Everything else (table, dialogs, forms,
// permissions) is covered by component tests or api.spec.ts.
// TODO: add update tests when editing users is built.
// The test creates a throwaway user with a unique email and never touches the
// shared fixture admin/agent, which other tests and the storage states rely on.
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_STATE } from "../fixtures/users";

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

test.describe("User management flow (admin)", () => {
  test.use({ storageState: ADMIN_STATE });

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
