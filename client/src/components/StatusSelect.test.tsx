import axios, { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ticketQueryKey, type TicketDetail } from '@/lib/tickets'
import { StatusSelect } from './StatusSelect'

const ticket: TicketDetail = {
  id: 42,
  subject: 'Charged twice for annual plan',
  status: 'open',
  category: 'refund_request',
  senderName: 'Priya Shah',
  senderEmail: 'priya@example.com',
  createdAt: '2026-10-21T09:30:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
  assignedTo: null,
  body: 'My card was charged twice.',
}

// Own QueryClient so tests can inspect the cache and invalidations.
function renderSelect() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <StatusSelect ticketId={42} status={ticket.status} />
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

async function choose(option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Status' }))
  await user.click(await screen.findByRole('option', { name: option }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('StatusSelect', () => {
  it('shows the current status and offers every status', async () => {
    const user = userEvent.setup()
    renderSelect()

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    expect(trigger).toHaveTextContent('Open')

    await user.click(trigger)
    await screen.findByRole('option', { name: 'Closed' })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'New',
      'Open',
      'Resolved',
      'Closed',
    ])
  })

  it('saves the chosen status, updates the cached ticket and refreshes the list', async () => {
    const updated = { ...ticket, status: 'resolved' as const }
    const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { ticket: updated } })
    const { queryClient, invalidate } = renderSelect()

    await choose('Resolved')

    expect(patch).toHaveBeenCalledWith('/api/tickets/42', { status: 'resolved' })
    await waitFor(() => expect(queryClient.getQueryData(ticketQueryKey(42))).toEqual(updated))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] })
  })

  it('shows the new choice and disables the dropdown while saving', async () => {
    vi.spyOn(axios, 'patch').mockReturnValue(new Promise(() => {}))
    renderSelect()

    await choose('Closed')

    const trigger = screen.getByRole('combobox', { name: 'Status' })
    expect(trigger).toHaveTextContent('Closed')
    expect(trigger).toBeDisabled()
  })

  it('shows the server message and keeps the saved status when the update is rejected', async () => {
    vi.spyOn(axios, 'patch').mockRejectedValue(
      new AxiosError('Request failed with status code 404', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Ticket not found' },
        headers: {},
        config: { headers: new AxiosHeaders() },
      }),
    )
    renderSelect()

    await choose('Closed')

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found')
    const trigger = screen.getByRole('combobox', { name: 'Status' })
    expect(trigger).toHaveTextContent('Open')
    expect(trigger).toBeEnabled()
  })

  it('shows a generic message for other failures', async () => {
    vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Request failed with status code 500'))
    renderSelect()

    await choose('New')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update the status. Please try again.')
  })
})
