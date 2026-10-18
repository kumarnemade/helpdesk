// Setup project: logs in once per role and saves the session to storageState.
// Tests that log out must NOT use these states (logout deletes the DB session).
import { test as setup } from "@playwright/test";
import { loginViaUi } from "../fixtures/auth";
import { admin, ADMIN_STATE, agent, AGENT_STATE } from "../fixtures/users";

setup("authenticate as admin", async ({ page }) => {
  await loginViaUi(page, admin);
  await page.context().storageState({ path: ADMIN_STATE });
});

setup("authenticate as agent", async ({ page }) => {
  await loginViaUi(page, agent);
  await page.context().storageState({ path: AGENT_STATE });
});
