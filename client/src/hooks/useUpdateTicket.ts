import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import type { UpdateTicketInput } from 'core'
import { ticketQueryKey, ticketsQueryKey, updateTicket } from '@/lib/tickets'

// Saves a partial ticket update (assignee, status or category) from the detail
// page. On success the returned ticket replaces the cached one, and the list is
// refetched since it shows (and filters/sorts by) these fields.
export function useUpdateTicket(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateTicketInput) => updateTicket(ticketId, input),
    onSuccess: async (ticket) => {
      queryClient.setQueryData(ticketQueryKey(ticketId), ticket)
      await queryClient.invalidateQueries({ queryKey: ticketsQueryKey })
    },
  })
}

// 400 (e.g. assignee deleted meanwhile) and 404 (ticket gone) carry a message
// meant for the user; anything else gets the caller's fallback.
export function updateTicketErrorMessage(error: unknown, fallback: string) {
  if (isAxiosError<{ error?: string }>(error)) {
    const status = error.response?.status
    const message = error.response?.data?.error
    if ((status === 400 || status === 404) && message) return message
  }
  return fallback
}
