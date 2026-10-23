import axios from 'axios'
import type {
  ListTicketsQuery,
  TicketCategory,
  TicketCategoryFilter,
  TicketStatus,
  UpdateTicketInput,
} from 'core'

export type Ticket = {
  id: number
  subject: string
  status: TicketStatus
  category: TicketCategory | null
  senderName: string
  senderEmail: string
  createdAt: string
  assignedTo: { id: string; name: string } | null
}

// GET /api/tickets/:id: the list fields plus the opening email's plain-text body.
export type TicketDetail = Ticket & {
  body: string
  updatedAt: string
}

// One page of tickets plus how many tickets match the filters in total.
export type TicketsPage = {
  tickets: Ticket[]
  total: number
}

// Prefix of every tickets list query: invalidate it to refetch every page,
// filter and sort order.
export const ticketsQueryKey = ['tickets'] as const

export function ticketsListQueryKey(query: ListTicketsQuery) {
  return [...ticketsQueryKey, query] as const
}

// The server filters, sorts and paginates; tickets come back in the requested order.
export async function fetchTickets(query: ListTicketsQuery, signal?: AbortSignal) {
  const { data } = await axios.get<TicketsPage>('/api/tickets', { params: query, signal })
  return data
}

// Router state on links from the list to /tickets/:id: the list's query string
// (e.g. "?status=open&page=2"), so "Back to tickets" restores that view.
export type TicketLinkState = { from: string }

// Under the ticketsQueryKey prefix, so invalidating it refreshes details too.
export function ticketQueryKey(id: number) {
  return [...ticketsQueryKey, 'detail', id] as const
}

export async function fetchTicket(id: number, signal?: AbortSignal) {
  const { data } = await axios.get<{ ticket: TicketDetail }>(`/api/tickets/${id}`, { signal })
  return data.ticket
}

// Assign (user id) or unassign (null); returns the updated ticket.
export async function updateTicket(id: number, input: UpdateTicketInput) {
  const { data } = await axios.patch<{ ticket: TicketDetail }>(`/api/tickets/${id}`, input)
  return data.ticket
}

// Active users a ticket can be assigned to (agents and admins).
export type Assignee = { id: string; name: string }

export const assigneesQueryKey = ['ticket-assignees'] as const

export async function fetchAssignees(signal?: AbortSignal) {
  const { data } = await axios.get<{ users: Assignee[] }>('/api/tickets/assignees', { signal })
  return data.users
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
}

// Badge variant per status, shared by the list and the detail page.
export const TICKET_STATUS_BADGE_VARIANTS = {
  new: 'default',
  open: 'secondary',
  resolved: 'outline',
  closed: 'outline',
} as const satisfies Record<TicketStatus, string>

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general_question: 'General Question',
  technical_question: 'Technical Question',
  refund_request: 'Refund Request',
}

export const TICKET_CATEGORY_FILTER_LABELS: Record<TicketCategoryFilter, string> = {
  ...TICKET_CATEGORY_LABELS,
  none: 'Uncategorised',
}
