import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TicketCategory } from 'core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ticketQueryKey, type TicketDetail } from '@/lib/tickets'
import { CategorySelect } from './CategorySelect'

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
function renderSelect(category: TicketCategory | null = ticket.category) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <CategorySelect ticketId={42} category={category} />
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

async function choose(option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Category' }))
  await user.click(await screen.findByRole('option', { name: option }))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CategorySelect', () => {
  it('shows the current category and offers Uncategorised plus every category', async () => {
    const user = userEvent.setup()
    renderSelect()

    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('Refund Request')

    await user.click(trigger)
    await screen.findByRole('option', { name: 'Uncategorised' })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Uncategorised',
      'General Question',
      'Technical Question',
      'Refund Request',
    ])
  })

  it('shows "Uncategorised" when the ticket has no category', () => {
    renderSelect(null)

    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Uncategorised')
  })

  it('saves the chosen category, updates the cached ticket and refreshes the list', async () => {
    const updated = { ...ticket, category: 'technical_question' as const }
    const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { ticket: updated } })
    const { queryClient, invalidate } = renderSelect()

    await choose('Technical Question')

    expect(patch).toHaveBeenCalledWith('/api/tickets/42', { category: 'technical_question' })
    await waitFor(() => expect(queryClient.getQueryData(ticketQueryKey(42))).toEqual(updated))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] })
  })

  it('clears the category with null', async () => {
    const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { ticket: { ...ticket, category: null } } })
    renderSelect()

    await choose('Uncategorised')

    expect(patch).toHaveBeenCalledWith('/api/tickets/42', { category: null })
  })

  it('shows the new choice and disables the dropdown while saving', async () => {
    vi.spyOn(axios, 'patch').mockReturnValue(new Promise(() => {}))
    renderSelect()

    await choose('General Question')

    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('General Question')
    expect(trigger).toBeDisabled()
  })

  it('shows an error and keeps the saved category when saving fails', async () => {
    vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Request failed with status code 500'))
    renderSelect()

    await choose('General Question')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update the category. Please try again.')
    const trigger = screen.getByRole('combobox', { name: 'Category' })
    expect(trigger).toHaveTextContent('Refund Request')
    expect(trigger).toBeEnabled()
  })
})
