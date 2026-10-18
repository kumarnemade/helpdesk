// Role-based UI access, using the shared storageState sessions (read-only use).
import { expect, test } from "@playwright/test";
import { admin, ADMIN_STATE, agent, AGENT_STATE } from "../fixtures/users";

test.describe("Admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("sees the Users link in the nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("navigation").getByRole("link", { name: "Users" })).toBeVisible();
    await expect(page.getByRole("navigation").getByText(admin.name)).toBeVisible();
  });

  test("can navigate to /users via the nav link", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "Users" }).click();
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("can open /users directly and after reload", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

  test("Helpdesk brand link returns home", async ({ page }) => {
    await page.goto("/users");
    await page.getByRole("link", { name: "Helpdesk" }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Agent", () => {
  test.use({ storageState: AGENT_STATE });

  test("does not see admin links in the nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);
  });

  test("is redirected from /users to home on direct navigation", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });

  test("is redirected from /users after reload too", async ({ page }) => {
    await page.goto("/users");
    await page.reload();
    await expect(page).toHaveURL("/");
  });
});
