import { defineConfig, devices } from "@playwright/test";

// The test stack runs on its own ports so it can run alongside `bun run dev`.
// The API port must match PORT in server/.env.test, and the client origin must
// match CLIENT_ORIGIN there.
const API_URL = "http://localhost:3001";
const CLIENT_URL = "http://localhost:5174";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: CLIENT_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /.*\.setup\.ts/,
      dependencies: ["setup"],
    },
  ],
  // Never reuse running servers: the API command resets the test database
  // before starting, so every run begins from a fresh, seeded schema.
  webServer: [
    {
      name: "API",
      command: "bun run test:server",
      cwd: "../server",
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      stdout: "pipe",
    },
    {
      name: "Client",
      command: "bun run dev --port 5174 --strictPort",
      cwd: "../client",
      url: CLIENT_URL,
      env: { API_URL },
      reuseExistingServer: false,
    },
  ],
});
