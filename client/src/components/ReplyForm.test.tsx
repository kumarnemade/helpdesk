import axios, { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import type { TicketReply } from '@/lib/tickets'
import { ReplyForm } from './ReplyForm'

const reply: TicketReply = {
  id: 7,
  body: 'The refund is on its way.',
  senderType: 'agent',
  senderName: 'Alan Agent',
  senderEmail: 'alan@example.com',
  createdAt: '2026-10-22T10:00:00.000Z',
  author: { id: 'u2', name: 'Alan Agent' },
}

function axiosError(status: number, statusText: string, data: unknown) {
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText,
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

// Uses its own QueryClient (rather than renderWithQueryClient) so the test can
// check which queries a successful reply invalidates.
function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <ReplyForm ticketId={42} />
    </QueryClientProvider>,
  )
  return { invalidate }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ReplyForm', () => {
  it('shows a validation error for an empty reply without calling the API', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(axios, 'post')
    renderWithQueryClient(<ReplyForm ticketId={42} />)

    // Whitespace only is trimmed to empty by the schema.
    await user.type(screen.getByLabelText('Reply'), '   ')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByText('Reply cannot be empty')).toBeInTheDocument()
    expect(screen.getByLabelText('Reply')).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('posts the trimmed reply, clears the form and refetches the thread', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { reply } })
    const { invalidate } = renderForm()

    await user.type(screen.getByLabelText('Reply'), '  The refund is on its way.  ')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(post).toHaveBeenCalledWith('/api/tickets/42/replies', { body: 'The refund is on its way.' })
    await vi.waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(''))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tickets', 'detail', 42, 'replies'] })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("shows the server's message for a 404 and keeps the text", async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError(404, 'Not Found', { error: 'Ticket not found' }))
    renderWithQueryClient(<ReplyForm ticketId={42} />)

    await user.type(screen.getByLabelText('Reply'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ticket not found')
    expect(screen.getByLabelText('Reply')).toHaveValue('Hello')
  })

  it('shows a generic error when the server fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError(500, 'Internal Server Error', { error: 'Internal Server Error' }))
    renderWithQueryClient(<ReplyForm ticketId={42} />)

    await user.type(screen.getByLabelText('Reply'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to send the reply. Please try again.')
  })
})
