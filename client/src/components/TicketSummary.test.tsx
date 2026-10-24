import axios, { AxiosError, AxiosHeaders } from 'axios'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { TicketSummary } from './TicketSummary'

function axiosError(status: number, statusText: string, data: unknown) {
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText,
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TicketSummary', () => {
  it('shows a Summarize button and no summary or request until it is clicked', () => {
    const post = vi.spyOn(axios, 'post')
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('requests a summary of the ticket and shows it', async () => {
    const user = userEvent.setup()
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { summary: 'Priya was charged twice and wants a refund.' } })
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    expect(screen.getByText('Priya was charged twice and wants a refund.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/tickets/42/summary')
  })

  it('shows the summary in a box, with bullet lines as a list and other lines as paragraphs', async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { summary: 'Overview of the ticket.\n- Customer was charged twice.\n- Agent issued a refund.\n\nNo next steps.' },
    })
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    const heading = await screen.findByRole('heading', { name: 'Summary' })
    const box = heading.closest('[data-slot="card"]')
    expect(box).not.toBeNull()
    const items = within(box as HTMLElement).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['Customer was charged twice.', 'Agent issued a refund.'])
    expect(within(box as HTMLElement).getByText('Overview of the ticket.')).toBeInTheDocument()
    expect(within(box as HTMLElement).getByText('No next steps.')).toBeInTheDocument()
  })

  it('disables the button and shows "Summarizing…" while the summary is generated', async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockReturnValue(new Promise(() => {}))
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('button', { name: 'Summarizing…' })).toBeDisabled()
  })

  it('generates a new summary every time the button is clicked', async () => {
    const user = userEvent.setup()
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { summary: 'First summary.' } })
      .mockResolvedValueOnce({ data: { summary: 'Second summary.' } })
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))
    expect(await screen.findByText('First summary.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Regenerate summary' }))
    expect(await screen.findByText('Second summary.')).toBeInTheDocument()
    expect(screen.queryByText('First summary.')).not.toBeInTheDocument()
    expect(post).toHaveBeenCalledTimes(2)
  })

  it("shows the server's message when summaries aren't configured", async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockRejectedValue(
      axiosError(503, 'Service Unavailable', { error: "Ticket summaries aren't configured" }),
    )
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('alert')).toHaveTextContent("Ticket summaries aren't configured")
    expect(screen.getByRole('button', { name: 'Summarize' })).toBeEnabled()
  })

  it('shows a generic error when the request fails unexpectedly', async () => {
    const user = userEvent.setup()
    vi.spyOn(axios, 'post').mockRejectedValue(axiosError(500, 'Internal Server Error', { error: 'Internal Server Error' }))
    renderWithQueryClient(<TicketSummary ticketId={42} />)

    await user.click(screen.getByRole('button', { name: 'Summarize' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to summarize the ticket. Please try again.')
    expect(screen.queryByRole('heading', { name: 'Summary' })).not.toBeInTheDocument()
  })
})
