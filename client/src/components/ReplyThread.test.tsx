import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { ticketRepliesQueryKey, type TicketReply } from '@/lib/tickets'
import { ReplyThread } from './ReplyThread'

const replies: TicketReply[] = [
  {
    id: 1,
    body: 'Any update on my refund?\nIt has been a week.',
    senderType: 'customer',
    senderName: 'Priya Shah',
    senderEmail: 'priya@example.com',
    createdAt: '2026-10-21T10:00:00.000Z',
    author: null,
  },
  {
    id: 2,
    body: 'Sorry for the wait, the refund is on its way.',
    senderType: 'agent',
    senderName: 'Alan Agent',
    senderEmail: 'alan@example.com',
    createdAt: '2026-10-21T11:00:00.000Z',
    author: { id: 'u2', name: 'Alan Agent' },
  },
]

const aiReply: TicketReply = {
  id: 3,
  body: 'Hi Priya,\nYou can reset your password from the login page.',
  senderType: 'ai',
  senderName: 'AI',
  senderEmail: 'ai@helpdesk.local',
  createdAt: '2026-10-21T09:31:00.000Z',
  author: null,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReplyThread', () => {
  it("requests the ticket's replies with an abort signal", async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies } })
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    await screen.findByRole('list', { name: 'Replies' })
    expect(get).toHaveBeenCalledWith('/api/tickets/42/replies', { signal: expect.any(AbortSignal) })
  })

  it('requests the replies of the ticket it is given', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies: [] } })
    renderWithQueryClient(<ReplyThread ticketId={7} />)

    await screen.findByText('No replies yet.')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/tickets/7/replies', { signal: expect.any(AbortSignal) })
  })

  it('shows only skeletons with an accessible loading label while pending', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    const { container } = renderWithQueryClient(<ReplyThread ticketId={42} />)

    expect(screen.getByText('Loading replies…')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole('list', { name: 'Replies' })).not.toBeInTheDocument()
    expect(screen.queryByText('No replies yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  // ReplyForm invalidates this key after sending, so the new reply must appear.
  it('refetches and shows a new reply when its query is invalidated', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { replies: [replies[0]] } })
      .mockResolvedValueOnce({ data: { replies } })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <ReplyThread ticketId={42} />
      </QueryClientProvider>,
    )
    await screen.findByText(/Any update on my refund\?/)
    expect(screen.queryByText('Sorry for the wait, the refund is on its way.')).not.toBeInTheDocument()

    await queryClient.invalidateQueries({ queryKey: ticketRepliesQueryKey(42) })

    expect(await screen.findByText('Sorry for the wait, the refund is on its way.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Replies' })).getAllByRole('listitem')).toHaveLength(2)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shows customer and agent replies oldest first', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies } })
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    const items = within(await screen.findByRole('list', { name: 'Replies' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)

    const [customer, agent] = items as [HTMLElement, HTMLElement]
    expect(customer).toHaveTextContent('Priya Shah <priya@example.com>')
    expect(customer).toHaveAttribute('data-sender', 'customer')
    expect(within(customer).getByText('Customer')).toHaveAttribute('data-variant', 'outline')
    expect(within(customer).getByText(new Date(replies[0]!.createdAt).toLocaleString())).toBeInTheDocument()
    // Line breaks in the plain-text body are kept (whitespace-pre-wrap).
    expect(within(customer).getByText(/Any update on my refund\?\s+It has been a week\./)).toBeInTheDocument()

    expect(agent).toHaveTextContent('Alan Agent <alan@example.com>')
    expect(agent).toHaveAttribute('data-sender', 'agent')
    expect(within(agent).getByText('Agent')).toHaveAttribute('data-variant', 'secondary')
    expect(within(agent).getByText('Sorry for the wait, the refund is on its way.')).toBeInTheDocument()
  })

  it('labels replies written by AI auto-resolution', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies: [aiReply] } })
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    const [item] = within(await screen.findByRole('list', { name: 'Replies' })).getAllByRole('listitem') as [HTMLElement]
    expect(item).toHaveTextContent('AI <ai@helpdesk.local>')
    // The sender is also named "AI", so pick out the badge.
    const badge = item.querySelector('[data-slot="badge"]')
    expect(badge).toHaveTextContent(/^AI$/)
    expect(badge).toHaveAttribute('data-variant', 'ai')
    expect(item).toHaveAttribute('data-sender', 'ai')
    expect(within(item).getByText(/You can reset your password from the login page\./)).toBeInTheDocument()
  })

  it('shows an empty message when there are no replies', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies: [] } })
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    expect(await screen.findByText('No replies yet.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Replies' })).not.toBeInTheDocument()
  })

  it('shows an error alert when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load replies. Please try again.')
    expect(screen.queryByText('Loading replies…')).not.toBeInTheDocument()
  })
})
