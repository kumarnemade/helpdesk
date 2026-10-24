// Real sign-in against the server (valid, case-insensitive email, rejected credentials). All tests run in fresh, unauthenticated contexts and
// do their own login, so they never touch the shared storageState sessions.
import { expect, test } from "@playwright/test";
import { admin, agent } from "../fixtures/users";

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("admin logs in and lands on the home page", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${admin.name}` })).toBeVisible();
  });

  test("email is matched case-insensitively", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email.toUpperCase());
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });

  test("rejects a wrong password with a generic error", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill("definitely-the-wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rejects an unknown email with the same error as a wrong password", async ({ page }) => {
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("some-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Identical message: the form must not reveal which emails exist.
    await expect(page.getByRole("alert")).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);
  });

});

test.describe("Login page when already authenticated", () => {
  test("redirects a signed-in user from /login to home", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(agent.email);
    await page.getByLabel("Password").fill(agent.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await page.goto("/login");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
  });
});
