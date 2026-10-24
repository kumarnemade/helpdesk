// Role-based UI access, using the shared storageState sessions (read-only use).
import { expect, test } from "@playwright/test";
import { ADMIN_STATE, agent, AGENT_STATE } from "../fixtures/users";

test.describe("Admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("can open /users directly and after reload", async ({ page }) => {
    await page.goto("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL("/users");
    await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
  });

});

test.describe("Agent", () => {
  test.use({ storageState: AGENT_STATE });

  test("is redirected from /users to home on direct navigation", async ({ page }) => {
    await page.goto("/users");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  });

});
