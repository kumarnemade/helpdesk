# Helpdesk

AI-powered ticket management system. See `project-scope.md` for features, `tech-stack.md` for the stack, and `implementation-plan.md` for phased progress (tick items off as they're completed).

## Documentation

Always use the Context7 MCP server to fetch up-to-date documentation before writing or changing code that uses a library, framework, SDK, API, or CLI tool (Bun, Express, React, Vite, Tailwind, shadcn/ui, React Router, React Hook Form, Zod, Prisma, Anthropic SDK, SendGrid/Mailgun, Docker, etc.) — even when you think you know the API. Versions in this project are recent and may differ from training data.

1. `resolve-library-id` with the library name to get its `/org/project` ID (use a version-specific ID when one matches `package.json`).
2. `query-docs` with that ID, one concept per query.

## Structure

Bun workspaces monorepo:

- `server/` — Express 5 + TypeScript, run directly by Bun (no compile step). Entry `src/index.ts`, app setup in `src/app.ts`, routers in `src/routes/`. All API routes live under `/api`.
- `server/prisma/` — Prisma 7 schema and migrations; config in `server/prisma.config.ts`. The client is generated into `server/src/generated/prisma` (git-ignored) and connects through the `@prisma/adapter-pg` driver adapter. Import the shared instance from `server/src/db.ts`; never create another `PrismaClient`.
- Auth — Better Auth (email/password, database sessions) configured in `server/src/auth.ts`; its handler is mounted at `/api/auth/*splat` **before** `express.json()`. `trustedOrigins` comes from the required `CLIENT_ORIGIN` env var (the server throws at startup if it's missing). Protect routes with `requireAuth` (`server/src/middleware/requireAuth.ts`), which puts `user`/`session` on `res.locals`. Auth tables (`user`, `session`, `account`, `verification`) are in `schema.prisma`; Better Auth checks them against the generated client at startup. Public sign-up is disabled (`disableSignUp`) — users are created by an admin (the first one via `db:seed`). Users have a server-owned `role` field (`admin` | `agent`, default `agent`, `input: false` so clients can't set it).
- Client auth — `authClient` (Better Auth React client) in `client/src/lib/auth-client.ts`, no `baseURL` so it calls `/api/auth` on the same origin; `inferAdditionalFields` exposes `role` on the session user. `/login` is `LoginPage`; all other routes are wrapped in `ProtectedLayout`, which redirects to `/login` when there's no session.
- `client/` — React 19 + TypeScript + Vite 8, Tailwind CSS v4 (via `@tailwindcss/vite`). UI components from shadcn/ui (default `radix-nova` style, neutral theme; config in `client/components.json`) live in `src/components/ui/` — add more with `bunx --bun shadcn@latest add <name>` from `client/`. Style with Tailwind utility classes and the theme tokens (`bg-background`, `text-muted-foreground`, `text-destructive`, …) rather than raw colors; no custom CSS files or inline `style`. `src/index.css` holds only the shadcn theme. Import via the `@/` alias (→ `client/src`).

## Commands

Run from the repo root:

- `bun install` — install all workspace deps (Bun uses isolated installs; each workspace has its own `node_modules`)
- `bun run dev` — start API (http://localhost:3000) and client (http://localhost:5173) in watch mode
- `bun run typecheck` — type-check both packages
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
- Client calls the API with relative `/api/...` paths; Vite proxies `/api` to `localhost:3000` in dev.
- Forms use React Hook Form with a Zod schema via `zodResolver` (see `client/src/pages/LoginPage.tsx`): infer the values type with `z.infer`, set `noValidate` on the `<form>` so Zod owns validation, show field errors under each input with `aria-invalid`, and report server errors with `setError('root', …)`. Zod is v4 — use top-level formats like `z.email()`.
- Express 5 forwards rejected promises from async handlers to the error handler — no try/catch wrappers needed. Errors return JSON `{ error }`; 5xx responses hide internal details.
- Server TypeScript is strict with `noUncheckedIndexedAccess`; keep `bun run typecheck` passing.
