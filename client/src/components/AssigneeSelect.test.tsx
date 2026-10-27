import axios, { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ticketQueryKey, type Assignee, type TicketDetail } from '@/lib/tickets'
import { AssigneeSelect } from './AssigneeSelect'

const assignees: Assignee[] = [
  { id: 'u1', name: 'Admin' },
  { id: 'u2', name: 'Alan Agent' },
  { id: 'u3', name: 'Bea Agent' },
]

const ticket: TicketDetail = {
  id: 42,
  subject: 'Charged twice for annual plan',
  status: 'open',
  category: 'refund_request',
  senderName: 'Priya Shah',
  senderEmail: 'priya@example.com',
  createdAt: '2026-10-21T09:30:00.000Z',
  updatedAt: '2026-10-22T10:00:00.000Z',
  assignedTo: { id: 'u2', name: 'Alan Agent' },
  body: 'My card was charged twice.',
}

// Uses its own QueryClient (rather than renderWithQueryClient) so tests can
// inspect the cache and invalidations after saving.
function renderSelect(assignedTo: Assignee | null = ticket.assignedTo) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <AssigneeSelect ticketId={42} assignedTo={assignedTo} />
    </QueryClientProvider>,
  )
  return { queryClient, invalidate }
}

function mockAssignees() {
  return vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: assignees } })
}

async function choose(option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'Assigned to' }))
  await user.click(await screen.findByRole('option', { name: option }))
}

function apiError(status: number, error: string) {
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: { error },
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AssigneeSelect', () => {
  it('shows the current assignee and loads the assignees with an abort signal', async () => {
    const get = mockAssignees()
    renderSelect()

    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent('Alan Agent')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/tickets/assignees', { signal: expect.any(AbortSignal) }),
    )
  })

  it('shows "Unassigned" when nobody is assigned', () => {
    mockAssignees()
    renderSelect(null)

    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent('Unassigned')
  })

  it('lists Unassigned followed by every assignee', async () => {
    const user = userEvent.setup()
    mockAssignees()
    renderSelect()

    await user.click(screen.getByRole('combobox', { name: 'Assigned to' }))

    await screen.findByRole('option', { name: 'Admin' })
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Unassigned',
      'Admin',
      'Alan Agent',
      'Bea Agent',
    ])
  })

  it('assigns the chosen user, updates the cached ticket and refreshes the list', async () => {
    mockAssignees()
    const updated = { ...ticket, assignedTo: { id: 'u3', name: 'Bea Agent' } }
    const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { ticket: updated } })
    const { queryClient, invalidate } = renderSelect()
    await screen.findByRole('combobox', { name: 'Assigned to' })

    await choose('Bea Agent')

    expect(patch).toHaveBeenCalledWith('/api/tickets/42', { assignedToId: 'u3' })
    await waitFor(() => expect(queryClient.getQueryData(ticketQueryKey(42))).toEqual(updated))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets'] })
  })

  it('unassigns with null', async () => {
    mockAssignees()
    const patch = vi.spyOn(axios, 'patch').mockResolvedValue({ data: { ticket: { ...ticket, assignedTo: null } } })
    renderSelect()

    await choose('Unassigned')

    expect(patch).toHaveBeenCalledWith('/api/tickets/42', { assignedToId: null })
  })

  it('shows the new choice and disables the dropdown while saving', async () => {
    mockAssignees()
    vi.spyOn(axios, 'patch').mockReturnValue(new Promise(() => {}))
    renderSelect()

    await choose('Bea Agent')

    const trigger = screen.getByRole('combobox', { name: 'Assigned to' })
    expect(trigger).toHaveTextContent('Bea Agent')
    expect(trigger).toBeDisabled()
  })

  it('shows the server message and keeps the saved assignee when the assignee is rejected', async () => {
    mockAssignees()
    vi.spyOn(axios, 'patch').mockRejectedValue(apiError(400, 'Assignee not found'))
    renderSelect()

    await choose('Bea Agent')

    expect(await screen.findByRole('alert')).toHaveTextContent('Assignee not found')
    const trigger = screen.getByRole('combobox', { name: 'Assigned to' })
    expect(trigger).toHaveTextContent('Alan Agent')
    expect(trigger).toBeEnabled()
  })

  it('shows a generic message for other failures', async () => {
    mockAssignees()
    vi.spyOn(axios, 'patch').mockRejectedValue(new Error('Request failed with status code 500'))
    renderSelect()

    await choose('Admin')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to update the assignee. Please try again.')
  })

  it('keeps showing an assignee who is no longer in the list', () => {
    mockAssignees()
    renderSelect({ id: 'gone', name: 'Former Agent' })

    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent('Former Agent')
  })

  // The AI agent isn't in the list (only auto-resolution assigns it), nor are
  // deleted users: a ticket they hold shows them, but they can't be chosen.
  it("shows the AI agent on a ticket it holds but doesn't let it be chosen", async () => {
    const user = userEvent.setup()
    mockAssignees()
    const patch = vi.spyOn(axios, 'patch')
    renderSelect({ id: 'ai', name: 'AI' })

    const trigger = screen.getByRole('combobox', { name: 'Assigned to' })
    expect(trigger).toHaveTextContent('AI')
    await user.click(trigger)

    const ai = await screen.findByRole('option', { name: 'AI' })
    expect(ai).toHaveAttribute('aria-disabled', 'true')
    await user.click(ai)
    expect(patch).not.toHaveBeenCalled()
  })

  it('says when the assignees fail to load', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))
    renderSelect()

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load the list of assignees.")
    expect(screen.getByRole('combobox', { name: 'Assigned to' })).toHaveTextContent('Alan Agent')
  })
})
