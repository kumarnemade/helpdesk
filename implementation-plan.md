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

- [ ] Create user management page (admin only)
- [x] Implement create agent API endpoint
- [x] Implement list users API endpoint
- [ ] Implement edit user API endpoint
- [x] Implement delete user API endpoint
- [ ] Add role-based access control (admin vs agent)

## Phase 4: Ticket CRUD

- [ ] Implement create ticket API endpoint
- [x] Implement list tickets API endpoint (with filtering by status and category, sorting)
- [x] Implement get ticket API endpoint
- [x] Implement update ticket API endpoint (change status, assign agent) — `PATCH /api/tickets/:id` (status, category, assignee) with dropdowns on the detail page
- [x] Create ticket list page with filtering and sorting — search, status/category filters, sortable headers and pagination (TanStack Table, server-side, state in the URL)
- [x] Create ticket detail page — read-only (details and plain-text opening email); actions come with the update endpoint
- [x] Reply to tickets — reply thread (customer and agent replies) and a reply form on the detail page (`GET`/`POST /api/tickets/:id/replies`); no outbound email yet

## Phase 5: AI Features

- [ ] Set up Claude API integration
- [x] Implement auto-classification (categorize incoming tickets) — new tickets from the inbound-email webhook are classified in the background with Gemini (`Output.choice` over the ticket categories); never overwrites a category set by an agent
- [x] Implement AI summary endpoint (generate ticket summary) — `POST /api/tickets/:id/summary` (Gemini via the Vercel AI SDK) with a "Summarize" button below the opening email; regenerated on every click, never saved
- [ ] Implement AI suggested reply endpoint
- [ ] Build knowledge base structure and seed with initial content
- [x] AI reply polishing — "Polish" button in the reply form (`POST /api/tickets/:id/replies/polish`, Google `gemini-3.5-flash-lite` via the Vercel AI SDK)
- [ ] Integrate AI features into ticket detail page UI

## Phase 6: Email Integration

- [ ] Set up email provider (SendGrid/Mailgun)
- [x] Implement inbound email webhook to create tickets
- [ ] Implement outbound email sending when an agent replies
- [x] Handle email threading (replies linked to existing tickets)

## Phase 7: Dashboard

- [ ] Create dashboard page with ticket overview stats (open, resolved, closed counts)
- [ ] Add tickets by category breakdown
- [ ] Add recent tickets list
- [ ] Add quick filters to navigate to filtered ticket list

## Phase 8: Polish & Deployment

- [ ] Add input validation and error handling across all endpoints
- [ ] Add loading states and error states on the frontend
- [ ] Write Dockerfile for server and client
- [ ] Set up Docker Compose for local development
- [ ] Write deployment configuration