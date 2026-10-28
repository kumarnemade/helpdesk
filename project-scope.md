# AI-Powered Ticket Management System

## Problem

We receive hundreds of support emails daily. Our agents manually read, classify, and respond to each ticket — which is slow and leads to impersonal, canned responses.

## Solution

Build a ticket management system that uses AI to automatically classify, respond to, and route support tickets — delivering faster, more personalized responses to students while freeing up agents for complex issues.

## Features

- **Receive support emails and create tickets** — the helpdesk's Gmail inbox is read every minute (plus a provider-agnostic inbound webhook); customer replies are threaded onto the existing ticket, and automated mail (auto-replies, mailing lists, bounces) is skipped
- **Email replies to customers** — agent and AI replies are emailed back from the helpdesk address in the same email thread
- **AI auto-resolution** — new tickets are answered automatically when the knowledge base fully covers them; otherwise they're handed to an agent
- **AI-powered ticket classification** — General Question, Technical Question or Refund Request (never overwrites an agent's choice)
- **AI summaries** — summarise a ticket's opening email and replies on demand
- **AI reply polishing** — rewrite an agent's draft reply before sending
- **Ticket list** — search, status/category filters, sorting and pagination, with the view kept in the URL
- **Ticket detail view** — change status, category and assignee; read and send replies
- **User management (admin only)** — create agents and soft-delete them (their sessions end and their tickets are unassigned)
- **Dashboard** — total tickets, open tickets, tickets resolved by AI (count and %), average resolution time and tickets per day over the last 30 days

## Ticket Statuses

- **New** — just received, not yet looked at
- **Processing** — AI is working on it (hidden from the ticket list until it's done)
- **Open** — needs an agent
- **Resolved** — answered (by AI or an agent); a customer reply reopens it
- **Closed** — finished

Lifecycle: New → Processing → Resolved (AI answered) or Open (handed to agents) → Resolved → Closed.

## Ticket Categories

- General Question
- Technical Question
- Refund Request

## User Roles

- **Admin**: Created with the system (`db:seed`). Can create and manage agents.
- **Agent**: Created by an admin. Can view and manage tickets.
- **AI agent**: A built-in "AI" user that owns tickets during auto-resolution. Nobody can sign in as it, it's hidden from the users list, and agents can't assign tickets to it.

Public sign-up is disabled — every account is created by an admin.

## Not Built Yet

- Editing users
- Creating tickets manually (tickets only come from email)
- Dashboard breakdown by category, recent tickets list and quick filters
- Generating a reply from scratch (only polishing an agent's draft)
