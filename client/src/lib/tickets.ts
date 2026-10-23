import axios from 'axios'
import type { ListTicketsQuery, TicketCategory, TicketStatus } from 'core'

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

// Prefix of every tickets list query: invalidate it to refetch all sort orders.
export const ticketsQueryKey = ['tickets'] as const

export function ticketsListQueryKey(query: ListTicketsQuery) {
  return [...ticketsQueryKey, query] as const
}

// The server sorts; tickets come back in the requested order.
export async function fetchTickets(query: ListTicketsQuery, signal?: AbortSignal) {
  const { data } = await axios.get<{ tickets: Ticket[] }>('/api/tickets', { params: query, signal })
  return data.tickets
}

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  new: 'New',
  open: 'Open',
  resolved: 'Resolved',
  closed: 'Closed',
}

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  general_question: 'General question',
  technical_question: 'Technical question',
  refund_request: 'Refund request',
}
