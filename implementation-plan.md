# Implementation Plan

## Phase 1: Project Setup

- [x] Initialize monorepo structure (`/client`, `/server`)
- [x] Set up Express server with TypeScript
- [x] Set up React app with TypeScript
- [x] Set up PostgreSQL database

## Phase 2: Authentication

- [x] Create login page
- [x] Implement login API endpoint
- [x] Implement session-based authentication middleware
- [x] Implement logout API endpoint
- [x] Add route protection on the frontend (redirect to login if unauthenticated)

## Phase 3: User Management

- [x] Create user management page (admin only) — `/users` with "Create user" and delete dialogs
- [x] Implement create agent API endpoint
- [x] Implement list users API endpoint
- [ ] Implement edit user API endpoint
- [x] Implement delete user API endpoint — soft delete (ends sessions, unassigns tickets)
- [x] Add role-based access control (admin vs agent) — `requireRole('admin')` on admin API routes; `AdminRoute` and admin-only NavBar links in the client

## Phase 4: Ticket CRUD

- [x] Implement create ticket API endpoint — tickets are created from email (Gmail inbox and `POST /api/inbound-email`), not by a manual endpoint
- [x] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [x] Implement get ticket API endpoint
- [x] Implement update ticket API endpoint (change status, assign agent) — `PATCH /api/tickets/:id` (status, category, assignee) with dropdowns on the detail page
- [x] Create ticket list page with filtering and sorting — search, status/category filters, sortable headers and pagination (TanStack Table, server-side, state in the URL)
- [x] Create ticket detail page — details, plain-text opening email, status/category/assignee dropdowns, reply thread and AI tools
- [x] Reply to tickets — reply thread (customer, agent and AI replies) and a reply form on the detail page (`GET`/`POST /api/tickets/:id/replies`); replies are emailed to the customer

## Phase 5: AI Features

- [x] Set up AI integration — Google Gemini (`gemini-3.5-flash-lite`) via the Vercel AI SDK, enabled by `GOOGLE_GENERATIVE_AI_API_KEY` (chosen instead of the Claude API)
- [x] Implement auto-classification (categorize incoming tickets) — new tickets are classified by a pg-boss background job (queued in the ticket's transaction, retried on failure, survives restarts) with Gemini (`Output.choice` over the ticket categories); never overwrites a category set by an agent
- [x] Implement AI summary endpoint (generate ticket summary) — `POST /api/tickets/:id/summary` with a "Summarize" button in the side panel; regenerated on every click, never saved
- [ ] Implement AI suggested reply endpoint — partly covered by reply polishing (rewrites an agent's draft); generating a reply from scratch isn't built
- [x] Build knowledge base structure and seed with initial content — `server/knowledge-base.md`
- [x] AI auto-resolution — new tickets go `new` → `processing` (hidden from the ticket list) → `resolved` with an AI reply when the knowledge base answers them, else `open` for an agent (pg-boss job with retries and a dead-letter queue); tickets are assigned to the seeded "AI" agent (`db:seed:ai-agent`) during auto-resolution and unassigned when it hands them to agents
- [x] AI reply polishing — "Polish" button in the reply form (`POST /api/tickets/:id/replies/polish`)
- [x] Integrate AI features into ticket detail page UI — Polish, Summarize, and AI replies shown with an `AI` badge

## Phase 6: Email Integration

- [x] Set up email provider — a Gmail account (no domain needed): `server/src/gmailInbox.ts` reads its unread inbox every minute over IMAP (pg-boss schedule) into tickets and customer replies, skipping automated mail; enabled by `GMAIL_USER` / `GMAIL_APP_PASSWORD`
- [x] Implement inbound email webhook to create tickets
- [x] Implement outbound email sending when an agent replies — agent and AI replies are emailed to the customer by a `send-reply-email` job queued in the reply's transaction, over the Gmail API (OAuth) or Gmail SMTP as a fallback, threaded with `In-Reply-To`/`References`; `Reply.emailSentAt` prevents double sends
- [x] Handle email threading (replies linked to existing tickets)

## Phase 7: Dashboard

- [x] Create dashboard page with ticket overview stats — `/` shows total tickets, open tickets, tickets resolved by AI (count and %) and average resolution time (`GET /api/dashboard`, `Ticket.resolvedAt`), plus a bar chart of tickets per day over the last 30 days in the browser's time zone
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8: Polish & Deployment

- [x] Add input validation and error handling across all endpoints — Zod schemas from `core` on every body, query and param; JSON `{ error }` responses with 5xx details hidden
- [x] Error reporting with Sentry — server (`@sentry/bun`: 5xx responses, failed pg-boss jobs, pg-boss/IMAP errors, crashes) and client (`@sentry/react`: React render errors); optional via `SENTRY_DSN` / `VITE_SENTRY_DSN`; no source map upload yet
- [x] Add loading states and error states on the frontend — skeletons, empty states and `role="alert"` errors, covered by component tests
- [x] Write Dockerfile for server and client — one root `Dockerfile` builds the client and runs the server (which serves it), applying migrations on start
- [ ] Set up Docker Compose for local development
- [x] Write deployment configuration — Render free (Docker, `render.yaml`) + Supabase free Postgres, replies via the Gmail API; guide in `DEPLOYMENT.md`
- [x] Deploy to production — live at https://helpdesk-44c4.onrender.com
