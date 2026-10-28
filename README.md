# Helpdesk

An AI-powered support ticket system. Customer emails become tickets, AI classifies
them and auto-resolves the ones the knowledge base fully answers, and agents
handle the rest from a shared web app.

**Live demo:** https://helpdesk-44c4.onrender.com (free tier — the first request may take a minute to wake up)

## Features

- **Email in, email out** — reads the helpdesk's Gmail inbox every minute (or
  accepts a provider-agnostic webhook), creates tickets, threads customer replies
  onto existing tickets, and emails agent/AI replies back in the same thread.
- **AI auto-resolution** — answers new tickets from `server/knowledge-base.md`
  when it fully covers the question; otherwise escalates to an agent.
- **AI classification** — sorts tickets into General Question, Technical Question
  or Refund Request.
- **AI assist for agents** — polish a draft reply and summarise a ticket's thread.
- **Ticket list** — server-side search, status/category filters, sorting and
  pagination, all kept in the URL so views can be shared.
- **Ticket detail** — change status, category and assignee inline; read and send replies.
- **Dashboard** — totals, open tickets, AI-resolved share, average resolution
  time and a tickets-per-day chart.
- **User management (admin only)** — create and soft-delete agents.
- Light/dark theme, error reporting with Sentry.

## Tech stack

| Area | Tools |
|---|---|
| Runtime & monorepo | [Bun](https://bun.sh) workspaces |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, shadcn/ui, React Router, TanStack Query & Table, React Hook Form, Recharts |
| Backend | Express 5, Better Auth (email/password, database sessions), pg-boss background jobs |
| Database | PostgreSQL with Prisma 7 |
| Validation | Zod v4 schemas shared by client and server |
| AI | Google Gemini via the Vercel AI SDK |
| Email | Gmail IMAP (`imapflow`, `mailparser`), Gmail API / SMTP (`nodemailer`) |
| Testing | Vitest + React Testing Library, Playwright |
| Deployment | Docker on Render, Supabase Postgres, Sentry |

## Project structure

```
core/     Shared Zod schemas and constants used by client and server
client/   React app (Vite)
server/   Express API, Prisma schema & migrations, background jobs
e2e/      Playwright end-to-end tests
```

## Getting started

### Prerequisites

- [Bun](https://bun.sh)
- PostgreSQL — either installed locally (database `helpdesk` on `localhost:5432`) or run with [Docker](https://www.docker.com/) (see below)

### Setup

```bash
# 1. Install dependencies for all workspaces
bun install

# 2. Configure the server
cp server/.env.example server/.env
#    then edit server/.env — at least DATABASE_URL, BETTER_AUTH_SECRET,
#    INBOUND_EMAIL_SECRET and SEED_ADMIN_PASSWORD (12+ characters)

# 3. Optional: start Postgres in Docker instead of a local install
#    (creates helpdesk and helpdesk_test; set POSTGRES_PORT=5433 if 5432 is taken)
docker compose up -d
#    and in server/.env use
#    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/helpdesk?schema=public"

# 4. Set up the database (run from server/)
cd server
bun run db:migrate          # apply migrations
bun run db:generate         # generate the Prisma client
bun run db:seed             # create the admin user
bun run db:seed:ai-agent    # create the "AI" agent user
bun run db:seed:tickets     # optional: 100 demo tickets
cd ..

# 5. Start API (http://localhost:3000) and client (http://localhost:5173)
bun run dev
```

Sign in at http://localhost:5173 with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Docker Compose

| Command | Description |
|---|---|
| `docker compose up -d` | Start Postgres (data kept in the `helpdesk-db` volume) |
| `docker compose down` | Stop it, keeping the data |
| `docker compose down -v` | Stop it and delete the data |
| `docker compose --profile app up --build` | Also run the production image (API + built client) on http://localhost:3000, using the secrets in `server/.env` |

The `app` profile uses everything in `server/.env`, so if Gmail is configured
there it reads and replies from that inbox, just like `bun run dev`.

### Environment variables

All variables are documented in [`server/.env.example`](server/.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BETTER_AUTH_SECRET` | Yes | Session signing secret (32+ chars) |
| `BETTER_AUTH_URL` | Yes | Public URL of the API |
| `CLIENT_ORIGIN` | Yes | Frontend origin allowed to call the auth API |
| `INBOUND_EMAIL_SECRET` | Yes | Bearer token for `POST /api/inbound-email` (32+ chars) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | For seeding | First admin account |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Enables AI classification, auto-resolution, polish and summaries |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | No | Read the Gmail inbox and send replies |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` | No | Send replies over the Gmail API instead of SMTP |
| `SENTRY_DSN` | No | Server error reporting (client: `VITE_SENTRY_DSN` in `client/.env`) |

## Scripts

From the repo root:

| Command | Description |
|---|---|
| `bun run dev` | Start API and client in watch mode |
| `bun run build` | Build all packages |
| `bun run typecheck` | Type-check every workspace |
| `bun run test` | Run client component tests (Vitest) |
| `bun run test:e2e` | Run Playwright end-to-end tests (resets the `helpdesk_test` database) |

From `server/`: `db:migrate`, `db:generate`, `db:studio`, `db:seed`,
`db:seed:ai-agent`, `db:seed:tickets`.

## Deployment

The app deploys as a single Docker web service on Render's free plan (the API
also serves the built client) with a free Supabase Postgres database. The
`render.yaml` Blueprint and `Dockerfile` are included; see
[`DEPLOYMENT.md`](DEPLOYMENT.md) for the step-by-step guide.

## More docs

- [`project-scope.md`](project-scope.md) — problem, features, statuses, roles
- [`tech-stack.md`](tech-stack.md) — stack overview
- [`implementation-plan.md`](implementation-plan.md) — phased progress
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — deploying to Render + Supabase
