# Tech Stack

## Runtime & Monorepo

- Bun (runtime, package manager, workspaces)
- Shared `core` package with Zod schemas and constants used by client and server

## Frontend

- React 19 with TypeScript, built with Vite 8
- Tailwind CSS v4
- shadcn/ui components
- React Router
- TanStack Query (with axios) for data fetching
- TanStack Table v9 for the ticket list
- React Hook Form + Zod v4 for forms and validation
- Recharts (via shadcn `chart`) for the dashboard

## Backend

- Express 5 with TypeScript, run directly by Bun
- Better Auth (email/password, database sessions)
- helmet for security headers
- pg-boss background jobs (stored in Postgres) for classification, auto-resolution, sending email and polling Gmail

## Database

- PostgreSQL

## ORM

- Prisma 7 with the `@prisma/adapter-pg` driver adapter

## AI

- Google Gemini (`gemini-3.5-flash-lite`) via the Vercel AI SDK (`ai` + `@ai-sdk/google`) for ticket classification, auto-resolution, summaries and reply polishing

## Email

- Inbound: Gmail IMAP (`imapflow` + `mailparser`), plus a provider-agnostic inbound webhook for other providers and testing
- Outbound: Gmail API over HTTPS (OAuth refresh token), falling back to Gmail SMTP (`nodemailer`)

## Monitoring

- Sentry for error reporting (`@sentry/bun` on the server, `@sentry/react` on the client)

## Testing

- Vitest + React Testing Library (component tests)
- Playwright (end-to-end tests)

## Deployment

- Docker on Render (free web service; the API also serves the built client)
- Supabase (free PostgreSQL)
