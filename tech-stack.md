# Tech Stack

## Frontend

- React with TypeScript
- Tailwind CSS
- shadcn/ui components
- React Hook Form + Zod for forms and validation
- React Router

## Backend

- Node.js with Express and TypeScript
- Database sessions for authentication

## Database

- PostgreSQL

## ORM

- Prisma

## AI

- Claude API (Anthropic) for ticket classification, summaries, and suggested replies

## Email

- Gmail (IMAP via `imapflow` + `mailparser` for inbound, SMTP via `nodemailer` for outbound replies); the provider-agnostic inbound webhook stays for other providers and testing

## Deployment

- Docker + cloud provider (AWS, Railway, Fly.io, etc.)