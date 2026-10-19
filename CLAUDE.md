# Helpdesk

AI-powered ticket management system. See `project-scope.md` for features, `tech-stack.md` for the stack, and `implementation-plan.md` for phased progress (tick items off as they're completed).

## Documentation

Always use the Context7 MCP server to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, API, or CLI tool (Bun, Express, React, Vite, Tailwind, shadcn/ui, React Router, React Hook Form, Zod, TanStack Query, axios, Prisma, Anthropic SDK, SendGrid/Mailgun, Docker, etc.) — even when you think you know the API. Versions in this project are recent and may differ from training data.

1. `resolve-library-id` with the library name to get its `/org/project` ID (use a version-specific ID when one matches `package.json`).
2. `query-docs` with that ID, one concept per query.

## Structure

Bun workspaces monorepo:

- `server/` — Express 5 + TypeScript, run directly by Bun (no compile step). Entry `src/index.ts`, app setup in `src/app.ts`, routers in `src/routes/`. All API routes live under `/api`.
- `server/prisma/` — Prisma 7 schema and migrations; config in `server/prisma.config.ts`. The client is generated into `server/src/generated/prisma` (git-ignored) and connects through the `@prisma/adapter-pg` driver adapter. Import the shared instance from `server/src/db.ts`; never create another `PrismaClient`.
- Auth — Better Auth (email/password, database sessions) configured in `server/src/auth.ts`; its handler is mounted at `/api/auth/*splat` **before** `express.json()`. `trustedOrigins` comes from the required `CLIENT_ORIGIN` env var (the server throws at startup if it's missing). Protect routes with `requireAuth` (`server/src/middleware/requireAuth.ts`), which puts `user`/`session` on `res.locals`; mount `requireRole('admin')` (`server/src/middleware/requireRole.ts`) after it on admin routes (e.g. `app.use("/api/users", requireAuth, requireRole("admin"), usersRouter)`). Route handlers return users through an explicit `select`/field list so new columns aren't exposed by default. Startup also requires `BETTER_AUTH_SECRET` (32+ chars). Passwords must be 12+ characters (`MIN_PASSWORD_LENGTH`). Rate limiting is on only when `NODE_ENV=production` and is stored in the `rateLimit` table (sign-in: 5/min per IP). The client IP comes from Express's `req.ip`, so set `TRUST_PROXY` when the API runs behind a proxy. Responses go through `helmet`; error bodies contain only the standard status text. Auth tables (`user`, `session`, `account`, `verification`) are in `schema.prisma`; Better Auth checks them against the generated client at startup. Public sign-up is disabled (`disableSignUp`) — users are created by an admin (the first one via `db:seed`). Users have a server-owned `role` field (`admin` | `agent`, default `agent`, `input: false` so clients can't set it).
- Client auth — `authClient` (Better Auth React client) in `client/src/lib/auth-client.ts`, no `baseURL` so it calls `/api/auth` on the same origin; `inferAdditionalFields` exposes `role` on the session user. `/login` is `LoginPage`; all other routes are wrapped in `ProtectedLayout`, which redirects to `/login` when there's no session. Admin-only pages (e.g. `/users`) are nested inside `AdminRoute` (`client/src/components/AdminRoute.tsx`) within `ProtectedLayout`, which redirects non-admins to `/`; `NavBar` shows admin links only when `user.role === 'admin'`. This is UI gating only — admin API routes must also check the role server-side.
- `client/` — React 19 + TypeScript + Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`). UI components from shadcn/ui (default `radix-nova` style, neutral theme; config in `client/components.json`) live in `src/components/ui/` — add more with `bunx --bun shadcn@latest add <name>` from `client/`. Style with Tailwind utility classes and the theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …) rather than raw colors; no custom CSS files or inline `style`. `src/index.css` holds only the shadcn theme. Import via the `@/` alias (→ `client/src`).
- `e2e/` — Playwright end-to-end tests. Setup, commands and test conventions are in `.claude/agents/e2e-test-writer.md`.

## Commands

Run from the repo root:

- `bun install` — install all workspace deps (Bun uses isolated installs; each workspace has its own `node_modules`)
- `bun run dev` — start API (http://localhost:3000) and client (http://localhost:5173) in watch mode
- `bun run typecheck` — type-check both packages
- `bun run test` — run client component tests (Vitest)
- `bun run build` — build both packages

Database (PostgreSQL `helpdesk` on localhost:5432; `DATABASE_URL` in `server/.env`, template in `server/.env.example`), run from `server/`:

- `bun run db:migrate` — create and apply a migration after editing `schema.prisma` (Prisma 7 does **not** regenerate the client; run `db:generate` afterwards)
- `bun run db:generate` — regenerate the Prisma client (also runs on `bun install`)
- `bun run db:studio` — open Prisma Studio
- `bun run db:seed` — create the admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (`prisma/seed.ts`; safe to re-run)

Always run Prisma through these scripts (`bun --bun prisma ...`) so Bun loads `.env`. Keep `prisma`, `@prisma/client` and `@prisma/adapter-pg` on the same exact version.

Add a dependency to one workspace: `bun add <pkg> --cwd server` (or `--cwd client`).

## Conventions

- Use Bun, not npm/yarn/pnpm or node.
- Always use `axios` with TanStack Query for client API calls — never raw `fetch` or `useEffect` + `useState` data loading (see `client/src/pages/UsersPage.tsx`). Reads use `useQuery` with a descriptive `queryKey` (e.g. `['users']`) and pass the query function's `signal` to axios so stale requests are cancelled; writes use `useMutation` and invalidate the affected query keys on success. Call relative `/api/...` paths; Vite proxies `/api` to `localhost:3000` in dev. Use the shared `queryClient` (`client/src/lib/query-client.ts`, provided in `main.tsx`) — don't create another; it doesn't retry 4xx responses, retries others once, and is cleared on sign-out. (Better Auth calls still go through `authClient`.)
- Forms use React Hook Form with a Zod schema via `zodResolver` (see `client/src/pages/LoginPage.tsx`): infer the values type with `z.infer`, set `noValidate` on the `<form>` so Zod owns validation, show field errors under each input with `aria-invalid`, and report server errors with `setError('root', …)`. Zod is v4 — use top-level formats like `z.email()`.
- Express 5 forwards rejected promises from async handlers to the error handler — no try/catch wrappers needed. Errors return JSON `{ error }`; 5xx responses hide internal details.
- Server TypeScript is strict with `noUncheckedIndexedAccess`; keep `bun run typecheck` passing.

## Testing

### Component tests (client)

Stack: Vitest + jsdom + React Testing Library, configured in the `test` block of `client/vite.config.ts`. `client/src/test/setup.ts` loads the jest-dom matchers (`toBeInTheDocument`, `toHaveTextContent`, …) and runs `cleanup` after each test. Reference example: `client/src/pages/UsersPage.test.tsx`.

When to write them: add or update component tests in the main session whenever you create or change a page or component with its own logic (data loading, conditional rendering, form validation, role-dependent UI). Component tests cover a single component's states with the API mocked; full user flows across the real server belong in E2E tests.

Writing them:

- File next to the component as `<Component>.test.tsx` (only `src/**/*.test.{ts,tsx}` is picked up).
- Vitest globals are off — import `describe`, `it`, `expect`, `vi`, `afterEach` from `vitest`.
- Render anything that uses TanStack Query with `renderWithQueryClient` from `@/test/render` (fresh `QueryClient` per test, retries off so error states appear immediately). Wrap in a `MemoryRouter` if the component uses React Router.
- Mock the API at the axios boundary: `vi.spyOn(axios, 'get').mockResolvedValue({ data: … })` (or `mockRejectedValue` for errors, `mockReturnValue(new Promise(() => {}))` to hold it pending), and call `vi.restoreAllMocks()` in `afterEach`. Assert the request too (URL, and `{ signal: expect.any(AbortSignal) }` for queries).
- Cover every state the component renders: loading (skeletons + the `sr-only` label), success with realistic data, empty, and error (`role="alert"`). For forms, cover validation errors and the server-error `root` message.
- Query like a user: `getByRole` (with `name`) first, then `getByText`/`getByLabelText`; use `findBy…` to wait for async content and `queryBy…` with `.not.toBeInTheDocument()` for absence. Don't select by Tailwind classes; a `data-slot`/`data-variant` attribute is fine when it's the only visible distinction (e.g. badge variants).
- Keep tests deterministic: build expected dates with the same `toLocaleDateString()` call the component uses instead of hard-coding a locale format.

Running them (from the repo root unless noted):

- `bun run test` — run the whole suite once (do this before committing; it should pass alongside `bun run typecheck`).
- From `client/`: `bun run test:watch` re-runs on save while writing tests; `bun run test:ui` opens the Vitest UI in the browser (open the `?token=` URL it prints); `bunx vitest run src/pages/UsersPage.test.tsx` runs one file; add `-t "empty state"` to run tests whose name matches.
- Don't use `bun --bun vitest` — jsdom fails under Bun's runtime, so Vitest runs on Node.

### End-to-end tests

- Use the `e2e-test-writer` subagent (`.claude/agents/e2e-test-writer.md`) to write or update Playwright E2E tests rather than writing them in the main session; it holds the test setup and conventions. Launch it when the user asks for tests and after finishing a significant page, user flow or role-gated feature.
- In the prompt, name the feature or flow to cover and the files involved (pages, routes, endpoints) so it doesn't have to rediscover them.
- Running the tests resets `helpdesk_test`, which Prisma blocks for AI agents, and the subagent can't ask the user. Before launching it, ask the user whether it may run the tests. If they agree, include their exact reply in the prompt as consent for `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. Otherwise tell it not to run them; it will only type-check and list the tests, and the user runs `bun run test:e2e`.
- When it finishes, report whether the tests were actually run and passed, and pass on any `data-testid` or source changes it suggests.
