// Session lifecycle. Tests that sign out log in themselves (a brand new DB
// session) so they never invalidate the shared storageState sessions.
import { expect, test } from "@playwright/test";
import { loginViaUi } from "../fixtures/auth";
import { admin, ADMIN_STATE, agent, CLIENT_ORIGIN } from "../fixtures/users";

test.describe("Unauthenticated access", () => {
  for (const path of ["/", "/users"]) {
    test(`redirects ${path} to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    });
  }

  test("redirects unknown routes to /login", async ({ page }) => {
    await page.goto("/no/such/page");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("deep link to a protected route lands on home, not the original page, after login", async ({ page }) => {
    // Actual behaviour: the redirect to /login carries no return URL and the
    // login page always navigates to "/".
    await page.goto("/users");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Session persistence (shared admin session)", () => {
  test.use({ storageState: ADMIN_STATE });

  test("stays signed in after a reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${admin.name}` })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${admin.name}` })).toBeVisible();
  });

  test("is shared with a second page in the same context", async ({ page, context }) => {
    await page.goto("/");
    const second = await context.newPage();
    await second.goto("/users");
    await expect(second).toHaveURL("/users");
    await expect(second.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("a new context without the cookie is not signed in", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await ctx.close();
  });
});

test.describe("Logout", () => {
  test("signs out, lands on /login and protected pages redirect afterwards", async ({ page }) => {
    await loginViaUi(page, agent);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    const me = await page.request.get("/api/me");
    expect(me.status()).toBe(401);
  });

  test("signing out in one tab ends the session in another tab", async ({ page, context }) => {
    await loginViaUi(page, agent);
    const other = await context.newPage();
    await other.goto("/");
    await expect(other.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await other.reload();
    await expect(other).toHaveURL(/\/login$/);
  });

  test("a signed-out session token is revoked server-side", async ({ page, context, playwright }) => {
    await loginViaUi(page, agent);
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const api = await playwright.request.newContext({ baseURL: CLIENT_ORIGIN });
    const before = await api.get("/api/me", { headers: { cookie: cookieHeader } });
    expect(before.status()).toBe(200);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Replaying the old cookie must fail: the DB session is gone.
    const after = await api.get("/api/me", { headers: { cookie: cookieHeader } });
    expect(after.status()).toBe(401);
    await api.dispose();
  });

  test("user can sign back in after signing out", async ({ page }) => {
    await loginViaUi(page, agent);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await loginViaUi(page, agent);
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
  });
});
