// API-level auth checks through the client origin (Vite proxies /api to :3001).
import { expect, test } from "@playwright/test";
import { admin, ADMIN_STATE, agent, AGENT_STATE, CLIENT_ORIGIN } from "../fixtures/users";

test.describe("GET /api/me", () => {
  test("returns 401 JSON without a session", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test.describe("as admin", () => {
    test.use({ storageState: ADMIN_STATE });
    test("returns only the whitelisted user fields", async ({ request }) => {
      const res = await request.get("/api/me");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(["user"]);
      expect(Object.keys(body.user).sort()).toEqual(["email", "id", "image", "name", "role"]);
      expect(body.user).toMatchObject({ email: admin.email, role: "admin" });
      const raw = JSON.stringify(body).toLowerCase();
      expect(raw).not.toContain("password");
      expect(raw).not.toContain("hash");
    });
  });

  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });
    test("returns the agent role", async ({ request }) => {
      const body = await (await request.get("/api/me")).json();
      expect(body.user).toMatchObject({ email: agent.email, role: "agent" });
    });
  });

  test("rejects a forged session cookie", async ({ request }) => {
    const res = await request.get("/api/me", {
      headers: { cookie: "better-auth.session_token=forged-token.invalidsignature" },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test("rejects an empty session cookie", async ({ request }) => {
    const res = await request.get("/api/me", {
      headers: { cookie: "better-auth.session_token=" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Sign-in API", () => {
  test("rejects wrong credentials with 401 and sets no session cookie", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: admin.email, password: "wrong-password-123" },
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });

  test("valid credentials set an HttpOnly session cookie", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: agent.email, password: agent.password },
    });
    expect(res.status()).toBe(200);
    const setCookie = res.headers()["set-cookie"] ?? "";
    expect(setCookie).toContain("better-auth.session_token=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
  });

  test("does not leak a password hash or the password in the response", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email: agent.email, password: agent.password },
    });
    const raw = (await res.text()).toLowerCase();
    expect(raw).not.toContain("hash");
    expect(raw).not.toContain(agent.password.toLowerCase());
  });
});

test.describe("Sign-up is disabled", () => {
  test("POST /api/auth/sign-up/email is rejected and creates no usable account", async ({ request }) => {
    const email = `intruder-${Date.now()}@example.com`;
    const password = "intruder-password-123";
    const res = await request.post("/api/auth/sign-up/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email, password, name: "Intruder" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
    expect(res.headers()["set-cookie"]).toBeUndefined();

    const login = await request.post("/api/auth/sign-in/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email, password },
    });
    expect(login.status()).toBe(401);
  });

  test("cannot sign up as admin by passing a role", async ({ request }) => {
    const email = `intruder-admin-${Date.now()}@example.com`;
    const res = await request.post("/api/auth/sign-up/email", {
      headers: { origin: CLIENT_ORIGIN },
      data: { email, password: "intruder-password-123", name: "Intruder", role: "admin" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});

test.describe("Privilege escalation", () => {
  test.use({ storageState: AGENT_STATE });

  test("an agent cannot set their own role via update-user", async ({ request }) => {
    const res = await request.post("/api/auth/update-user", {
      headers: { origin: CLIENT_ORIGIN },
      data: { role: "admin" },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);

    const me = await (await request.get("/api/me")).json();
    expect(me.user.role).toBe("agent");
  });

  test("role stays agent when sent alongside an allowed field", async ({ request }) => {
    await request.post("/api/auth/update-user", {
      headers: { origin: CLIENT_ORIGIN },
      data: { name: agent.name, role: "admin" },
    });
    const me = await (await request.get("/api/me")).json();
    expect(me.user.role).toBe("agent");
  });
});

// Better Auth disables its origin/CSRF check when NODE_ENV=test (see
// create-context: skipOriginCheck defaults to isTest()), and the e2e API runs
// with NODE_ENV=test. These tests assert the correct production behaviour but
// cannot pass in this stack, so they are fixme until the API can run with the
// check enabled (e.g. a test-only NODE_ENV override or explicit config).
test.describe("Origin protection", () => {
  test.fixme("rejects a sign-in request from an untrusted origin", async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      headers: { origin: "https://evil.example" },
      data: { email: admin.email, password: admin.password },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });

  test.describe("with a valid session cookie", () => {
    test.use({ storageState: AGENT_STATE });
    test.fixme("rejects a state-changing request from an untrusted origin", async ({ request }) => {
      const res = await request.post("/api/auth/update-user", {
        headers: { origin: "https://evil.example" },
        data: { name: "Hacked" },
      });
      expect(res.status()).toBe(403);
      const me = await (await request.get("/api/me")).json();
      expect(me.user.name).toBe(agent.name);
    });
  });
});

test.describe("Unknown API routes", () => {
  test("return 404 JSON without echoing the path", async ({ request }) => {
    const res = await request.get("/api/does-not-exist-xyz");
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
    expect(await res.text()).not.toContain("does-not-exist-xyz");
  });

  test("return 404 for non-GET methods too", async ({ request }) => {
    const res = await request.post("/api/nothing-here", { data: {} });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "Not Found" });
  });
});

test.describe("Security headers", () => {
  test("API responses carry helmet headers and no X-Powered-By", async ({ request }) => {
    const res = await request.get("/api/me");
    expect(res.headers()["x-powered-by"]).toBeUndefined();
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  });
});

test.describe("GET /api/users", () => {
  test("returns 401 JSON without a session", async ({ request }) => {
    const res = await request.get("/api/users");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });
    test("returns 403 Forbidden", async ({ request }) => {
      const res = await request.get("/api/users");
      expect(res.status()).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  test.describe("as admin", () => {
    test.use({ storageState: ADMIN_STATE });

    test("lists the admin and agent fixture users with correct roles", async ({ request }) => {
      const res = await request.get("/api/users");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(["users"]);
      expect(Array.isArray(body.users)).toBe(true);
      const byEmail = new Map<string, { role: string }>(
        body.users.map((u: { email: string; role: string }) => [u.email, u]),
      );
      expect(byEmail.get(admin.email)?.role).toBe("admin");
      expect(byEmail.get(agent.email)?.role).toBe("agent");
    });

    test("returns exactly id, name, email, role and createdAt per user", async ({ request }) => {
      const body = await (await request.get("/api/users")).json();
      expect(body.users.length).toBeGreaterThanOrEqual(2);
      for (const user of body.users) {
        expect(Object.keys(user).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
      }
      const raw = JSON.stringify(body).toLowerCase();
      expect(raw).not.toContain("password");
      expect(raw).not.toContain("emailverified");
    });

    test("orders users by createdAt ascending", async ({ request }) => {
      const body = await (await request.get("/api/users")).json();
      const times: number[] = body.users.map((u: { createdAt: string }) => Date.parse(u.createdAt));
      expect(times).toEqual([...times].sort((a, b) => a - b));
    });
  });
});

// Unique per call so tests never collide on the shared test DB or on retries.
function uniqueEmail(prefix = "newuser"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
const VALID_PASSWORD = "a-valid-password-123";

test.describe("POST /api/users", () => {
  test("returns 401 JSON without a session", async ({ request }) => {
    const res = await request.post("/api/users", {
      data: { name: "No Session", email: uniqueEmail(), password: VALID_PASSWORD },
    });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });
    test("returns 403 Forbidden", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Agent Attempt", email: uniqueEmail("agent-attempt"), password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  test.describe("as admin", () => {
    test.use({ storageState: ADMIN_STATE });

    test("returns 400 for a name shorter than 3 characters", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "  ab  ", email: uniqueEmail(), password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Name must be at least 3 characters" });
    });

    test("returns 400 for an invalid email", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Valid Name", email: "not-an-email", password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Enter a valid email address" });
    });

    test("returns 400 for a password shorter than 12 characters", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Valid Name", email: uniqueEmail(), password: "short-11-ch" },
      });
      expect(res.status()).toBe(400);
      expect(await res.json()).toEqual({ error: "Password must be at least 12 characters" });
    });

    test("returns 409 for a duplicate of a fixture user's email", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Duplicate", email: agent.email, password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(409);
      expect(await res.json()).toEqual({ error: "A user with this email already exists" });
    });

    test("returns 409 for a duplicate with different case and surrounding whitespace", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Duplicate", email: `  ${agent.email.toUpperCase()}  `, password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(409);
      expect(await res.json()).toEqual({ error: "A user with this email already exists" });
    });

    test("creates an agent and returns exactly the whitelisted fields", async ({ request }) => {
      const email = uniqueEmail("created");
      const res = await request.post("/api/users", {
        data: { name: "  Created User  ", email: `  ${email.toUpperCase()}  `, password: VALID_PASSWORD },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(Object.keys(body)).toEqual(["user"]);
      expect(Object.keys(body.user).sort()).toEqual(["createdAt", "email", "id", "name", "role"]);
      expect(body.user).toMatchObject({ name: "Created User", email, role: "agent" });
      expect(Number.isNaN(Date.parse(body.user.createdAt))).toBe(false);
      expect(JSON.stringify(body).toLowerCase()).not.toContain("password");
    });

    test("ignores a client-supplied role", async ({ request }) => {
      const res = await request.post("/api/users", {
        data: { name: "Sneaky Admin", email: uniqueEmail("sneaky"), password: VALID_PASSWORD, role: "admin" },
      });
      expect(res.status()).toBe(201);
      expect((await res.json()).user.role).toBe("agent");
    });

    test("the new user can sign in immediately but gets 403 on GET /api/users", async ({ request, playwright, baseURL }) => {
      const email = uniqueEmail("signin");
      const create = await request.post("/api/users", {
        data: { name: "Sign In User", email, password: VALID_PASSWORD },
      });
      expect(create.status()).toBe(201);

      // Fresh context so the admin cookies from storageState are not reused.
      const ctx = await playwright.request.newContext({ baseURL });
      try {
        const login = await ctx.post("/api/auth/sign-in/email", {
          headers: { origin: CLIENT_ORIGIN },
          data: { email, password: VALID_PASSWORD },
        });
        expect(login.status()).toBe(200);
        expect(login.headers()["set-cookie"] ?? "").toContain("better-auth.session_token=");

        const me = await (await ctx.get("/api/me")).json();
        expect(me.user).toMatchObject({ email, role: "agent" });

        const users = await ctx.get("/api/users");
        expect(users.status()).toBe(403);
        expect(await users.json()).toEqual({ error: "Forbidden" });
      } finally {
        await ctx.dispose();
      }
    });
  });
});

test.describe("DELETE /api/users/:id", () => {
  test("returns 401 JSON without a session", async ({ request }) => {
    const res = await request.delete("/api/users/some-id");
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  test.describe("as agent", () => {
    test.use({ storageState: AGENT_STATE });
    test("returns 403 Forbidden", async ({ request }) => {
      const res = await request.delete("/api/users/some-id");
      expect(res.status()).toBe(403);
      expect(await res.json()).toEqual({ error: "Forbidden" });
    });
  });

  test.describe("as admin", () => {
    test.use({ storageState: ADMIN_STATE });

    test("returns 404 for an unknown id", async ({ request }) => {
      const res = await request.delete("/api/users/does-not-exist-id");
      expect(res.status()).toBe(404);
      expect(await res.json()).toEqual({ error: "User not found" });
    });

    test("returns 403 when the admin targets themselves", async ({ request }) => {
      const me = await (await request.get("/api/me")).json();
      const res = await request.delete(`/api/users/${me.user.id}`);
      expect(res.status()).toBe(403);
      expect(await res.json()).toEqual({ error: "Admins cannot be deleted" });

      // Admin is still intact.
      expect((await request.get("/api/me")).status()).toBe(200);
    });

    test("soft-deletes a user: hidden, session revoked, sign-in blocked, email reserved", async ({ request, playwright, baseURL }) => {
      const email = uniqueEmail("todelete");
      const create = await request.post("/api/users", {
        data: { name: "To Delete", email, password: VALID_PASSWORD },
      });
      expect(create.status()).toBe(201);
      const { id } = (await create.json()).user;

      // Sign in with a fresh context so we hold the user's own session.
      const ctx = await playwright.request.newContext({ baseURL });
      try {
        const login = await ctx.post("/api/auth/sign-in/email", {
          headers: { origin: CLIENT_ORIGIN },
          data: { email, password: VALID_PASSWORD },
        });
        expect(login.status()).toBe(200);
        expect((await ctx.get("/api/me")).status()).toBe(200);

        const del = await request.delete(`/api/users/${id}`);
        expect(del.status()).toBe(204);
        expect(await del.text()).toBe("");

        const list = await (await request.get("/api/users")).json();
        expect(list.users.map((u: { id: string }) => u.id)).not.toContain(id);

        // Existing session is revoked.
        expect((await ctx.get("/api/me")).status()).toBe(401);

        // Sign-in is indistinguishable from a wrong password.
        const relogin = await playwright.request.newContext({ baseURL });
        try {
          const res = await relogin.post("/api/auth/sign-in/email", {
            headers: { origin: CLIENT_ORIGIN },
            data: { email, password: VALID_PASSWORD },
          });
          expect(res.status()).toBe(401);
          expect((await res.json()).code).toBe("INVALID_EMAIL_OR_PASSWORD");
          expect(res.headers()["set-cookie"]).toBeUndefined();
        } finally {
          await relogin.dispose();
        }
      } finally {
        await ctx.dispose();
      }

      const again = await request.delete(`/api/users/${id}`);
      expect(again.status()).toBe(404);
      expect(await again.json()).toEqual({ error: "User not found" });

      const recreate = await request.post("/api/users", {
        data: { name: "Reborn", email, password: VALID_PASSWORD },
      });
      expect(recreate.status()).toBe(409);
      expect(await recreate.json()).toEqual({ error: "This email belongs to a deleted user" });
    });
  });
});
