import axios, { AxiosError, AxiosHeaders } from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_EMAIL_BODY_LENGTH } from 'core'
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
  it('disables Send reply until the reply has text, without showing an error', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(axios, 'post')
    renderWithQueryClient(<ReplyForm ticketId={42} />)

    const send = screen.getByRole('button', { name: 'Send reply' })
    expect(send).toBeDisabled()

    // Whitespace only counts as empty, like the schema's trim.
    await user.type(screen.getByLabelText('Reply'), '   ')
    expect(send).toBeDisabled()
    await user.click(send)
    expect(post).not.toHaveBeenCalled()
    expect(screen.queryByText('Reply cannot be empty')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Reply'), 'hi')
    expect(send).toBeEnabled()
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

  describe('Polish', () => {
    it('is disabled until the reply has text', async () => {
      const user = userEvent.setup()
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      const polish = screen.getByRole('button', { name: 'Polish' })
      expect(polish).toBeDisabled()
      await user.type(screen.getByLabelText('Reply'), '   ')
      expect(polish).toBeDisabled()
      await user.type(screen.getByLabelText('Reply'), 'hi')
      expect(polish).toBeEnabled()
    })

    it('replaces the draft with the polished reply, which can then be sent', async () => {
      const user = userEvent.setup()
      const polished = 'Hi Jane,\n\nYour refund is on its way.'
      const post = vi
        .spyOn(axios, 'post')
        .mockResolvedValueOnce({ data: { body: polished } })
        .mockResolvedValueOnce({ data: { reply } })
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      await user.type(screen.getByLabelText('Reply'), '  refund on its way  ')
      await user.click(screen.getByRole('button', { name: 'Polish' }))

      expect(post).toHaveBeenCalledWith('/api/tickets/42/replies/polish', { body: 'refund on its way' })
      await vi.waitFor(() => expect(screen.getByLabelText('Reply')).toHaveValue(polished))

      await user.click(screen.getByRole('button', { name: 'Send reply' }))
      expect(post).toHaveBeenLastCalledWith('/api/tickets/42/replies', { body: polished })
    })

    it('shows "Polishing…" and disables both buttons while pending', async () => {
      const user = userEvent.setup()
      vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      await user.type(screen.getByLabelText('Reply'), 'Hello')
      await user.click(screen.getByRole('button', { name: 'Polish' }))

      expect(await screen.findByRole('button', { name: 'Polishing…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Send reply' })).toBeDisabled()
    })

    it('shows a validation error for a too-long draft without calling the API', async () => {
      const post = vi.spyOn(axios, 'post')
      const user = userEvent.setup()
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      // Paste rather than type: typing 100k characters is slow.
      await user.click(screen.getByLabelText('Reply'))
      await user.paste('a'.repeat(MAX_EMAIL_BODY_LENGTH + 1))
      await user.click(screen.getByRole('button', { name: 'Polish' }))

      expect(await screen.findByText(`Reply must be at most ${MAX_EMAIL_BODY_LENGTH} characters`)).toBeInTheDocument()
      expect(post).not.toHaveBeenCalled()
    })

    it("shows the server's message when polishing isn't configured and keeps the draft", async () => {
      const user = userEvent.setup()
      vi.spyOn(axios, 'post').mockRejectedValue(
        axiosError(503, 'Service Unavailable', { error: "Reply polishing isn't configured" }),
      )
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      await user.type(screen.getByLabelText('Reply'), 'Hello')
      await user.click(screen.getByRole('button', { name: 'Polish' }))

      expect(await screen.findByRole('alert')).toHaveTextContent("Reply polishing isn't configured")
      expect(screen.getByLabelText('Reply')).toHaveValue('Hello')
    })

    it('shows a generic error when polishing fails', async () => {
      const user = userEvent.setup()
      vi.spyOn(axios, 'post').mockRejectedValue(axiosError(500, 'Internal Server Error', { error: 'Internal Server Error' }))
      renderWithQueryClient(<ReplyForm ticketId={42} />)

      await user.type(screen.getByLabelText('Reply'), 'Hello')
      await user.click(screen.getByRole('button', { name: 'Polish' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('Failed to polish the reply. Please try again.')
      expect(screen.getByLabelText('Reply')).toHaveValue('Hello')
    })
  })
})
