// Login form behaviour. All tests run in fresh, unauthenticated contexts and
// do their own login, so they never touch the shared storageState sessions.
import { expect, test } from "@playwright/test";
import { admin, agent } from "../fixtures/users";

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("shows the sign-in form", async ({ page }) => {
    await expect(page.getByText("Sign in to your Helpdesk account.")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  test("admin logs in and lands on the home page", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${admin.name}` })).toBeVisible();
  });

  test("agent logs in and lands on the home page", async ({ page }) => {
    await page.getByLabel("Email").fill(agent.email);
    await page.getByLabel("Password").fill(agent.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: `Welcome, ${agent.name}` })).toBeVisible();
  });

  test("submits the form with the Enter key", async ({ page }) => {
    await page.getByLabel("Email").fill(agent.email);
    await page.getByLabel("Password").fill(agent.password);
    await page.getByLabel("Password").press("Enter");
    await expect(page).toHaveURL("/");
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

  test("clears the server error after a successful retry", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill("wrong-password-123");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL("/");
  });

  test("rejects the admin email with the agent's password", async ({ page }) => {
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(agent.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test.describe("client-side validation", () => {
    test("flags both empty fields without calling the API", async ({ page }) => {
      let apiCalled = false;
      await page.route("**/api/auth/sign-in/**", (route) => {
        apiCalled = true;
        return route.continue();
      });
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Enter a valid email address")).toBeVisible();
      await expect(page.getByText("Password is required")).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
      expect(apiCalled).toBe(false);
    });

    test("flags an invalid email format", async ({ page }) => {
      await page.getByLabel("Email").fill("not-an-email");
      await page.getByLabel("Password").fill("whatever-123456");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Enter a valid email address")).toBeVisible();
      await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Password")).not.toHaveAttribute("aria-invalid", "true");
    });

    test("flags only the password when email is valid", async ({ page }) => {
      await page.getByLabel("Email").fill(admin.email);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Password is required")).toBeVisible();
      await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByLabel("Email")).not.toHaveAttribute("aria-invalid", "true");
    });

    test("clears field errors once the input is corrected", async ({ page }) => {
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Enter a valid email address")).toBeVisible();
      await page.getByLabel("Email").fill(admin.email);
      await expect(page.getByText("Enter a valid email address")).toBeHidden();
      await expect(page.getByLabel("Email")).not.toHaveAttribute("aria-invalid", "true");
    });

    test("masks the password input", async ({ page }) => {
      await expect(page.getByLabel("Password")).toHaveAttribute("type", "password");
    });
  });

  test.describe("server and network responses", () => {
    test("shows the server's error message in the root alert", async ({ page }) => {
      await page.route("**/api/auth/sign-in/email", (route) =>
        route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "Something exploded" }),
        }),
      );
      await page.getByLabel("Email").fill(admin.email);
      await page.getByLabel("Password").fill(admin.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByRole("alert")).toHaveText("Something exploded");
      await expect(page).toHaveURL(/\/login$/);
    });

    test("disables the button and shows a loading label while submitting", async ({ page }) => {
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      await page.route("**/api/auth/sign-in/email", async (route) => {
        await gate;
        await route.continue();
      });
      await page.getByLabel("Email").fill(admin.email);
      await page.getByLabel("Password").fill(admin.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      const busy = page.getByRole("button", { name: "Signing in…" });
      await expect(busy).toBeVisible();
      await expect(busy).toBeDisabled();
      release();
      await expect(page).toHaveURL("/");
    });
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
