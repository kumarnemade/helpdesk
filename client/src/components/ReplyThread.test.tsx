import axios from 'axios'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import type { TicketReply } from '@/lib/tickets'
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

  it('shows skeletons with an accessible loading label while pending', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    const { container } = renderWithQueryClient(<ReplyThread ticketId={42} />)

    expect(screen.getByText('Loading replies…')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('shows customer and agent replies oldest first', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { replies } })
    renderWithQueryClient(<ReplyThread ticketId={42} />)

    const items = within(await screen.findByRole('list', { name: 'Replies' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)

    const [customer, agent] = items as [HTMLElement, HTMLElement]
    expect(customer).toHaveTextContent('Priya Shah <priya@example.com>')
    expect(within(customer).getByText('Customer')).toHaveAttribute('data-variant', 'outline')
    expect(within(customer).getByText(new Date(replies[0]!.createdAt).toLocaleString())).toBeInTheDocument()
    // Line breaks in the plain-text body are kept (whitespace-pre-wrap).
    expect(within(customer).getByText(/Any update on my refund\?\s+It has been a week\./)).toBeInTheDocument()

    expect(agent).toHaveTextContent('Alan Agent <alan@example.com>')
    expect(within(agent).getByText('Agent')).toHaveAttribute('data-variant', 'secondary')
    expect(within(agent).getByText('Sorry for the wait, the refund is on its way.')).toBeInTheDocument()
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
