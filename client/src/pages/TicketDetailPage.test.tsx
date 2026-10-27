import axios, { AxiosError, AxiosHeaders } from 'axios'
import { screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import type { TicketDetail, TicketReply } from '@/lib/tickets'
import { TicketDetailPage } from './TicketDetailPage'

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
  body: 'My card was charged $199 twice.\nPlease refund the duplicate payment.',
}

const reply: TicketReply = {
  id: 1,
  body: 'Any update on my refund?',
  senderType: 'customer',
  senderName: 'Priya Shah',
  senderEmail: 'priya@example.com',
  createdAt: '2026-10-22T09:00:00.000Z',
  author: null,
}

// Answers the ticket request with `ticketResponse` and the replies request
// (covered in ReplyThread.test.tsx) with one reply.
function mockGet(ticketResponse: unknown = { ticket }) {
  return vi.spyOn(axios, 'get').mockImplementation(async (url: string) =>
    url.endsWith('/replies') ? { data: { replies: [reply] } } : { data: ticketResponse },
  )
}

function renderPage(path = '/tickets/42') {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tickets/:id" element={<TicketDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function axiosError(status: number, statusText: string, error: string) {
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText,
    data: { error },
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

function notFoundError() {
  return axiosError(404, 'Not Found', 'Ticket not found')
}

const isRepliesRequest = ([url]: unknown[]) => typeof url === 'string' && url.endsWith('/replies')

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TicketDetailPage', () => {
  it('requests the ticket from the id in the URL with an abort signal', async () => {
    const get = mockGet()
    renderPage()

    await screen.findByRole('heading', { name: ticket.subject })
    // The assignee dropdown loads its own list (covered in AssigneeSelect.test.tsx).
    expect(get.mock.calls.filter(([url]) => url === '/api/tickets/42')).toHaveLength(1)
    expect(get).toHaveBeenCalledWith('/api/tickets/42', { signal: expect.any(AbortSignal) })
  })

  it('shows skeletons with an accessible loading label while pending', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    const { container } = renderPage()

    expect(screen.getByText('Loading ticket…')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the ticket details and the opening email', async () => {
    mockGet()
    renderPage()

    expect(await screen.findByRole('heading', { level: 1, name: ticket.subject })).toBeInTheDocument()
    expect(screen.getByText('Ticket #42')).toBeInTheDocument()

    const field = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling!
    // Status, category and assignee are editable dropdowns (tested in their own files).
    expect(within(field('Status') as HTMLElement).getByRole('combobox', { name: 'Status' })).toHaveTextContent('Open')
    expect(within(field('Category') as HTMLElement).getByRole('combobox', { name: 'Category' })).toHaveTextContent('Refund Request')
    expect(field('Assigned to')).toHaveTextContent('Alan Agent')
    // The received date sits with the subject, not among the dropdowns.
    expect(screen.getByText(`Received ${new Date(ticket.createdAt).toLocaleString()}`)).toBeInTheDocument()

    // The opening email's header names the sender.
    expect(document.querySelector('[data-slot="card-title"]')).toHaveTextContent('Priya Shah <priya@example.com>')
    // Line breaks in the plain-text body are kept (whitespace-pre-wrap).
    expect(screen.getByText(/My card was charged \$199 twice\.\s+Please refund/)).toBeInTheDocument()
  })

  it('puts the status, category and assignee dropdowns in the right-hand column', async () => {
    mockGet()
    renderPage()
    await screen.findByRole('heading', { name: ticket.subject })

    const sidebar = screen.getByRole('complementary', { name: 'Ticket properties' })
    expect(within(sidebar).getAllByRole('combobox').map((select) => select.getAttribute('aria-label'))).toEqual([
      'Status',
      'Category',
      'Assigned to',
    ])
    // The subject and the email stay in the main column.
    expect(within(sidebar).queryByRole('heading', { name: ticket.subject })).not.toBeInTheDocument()
    expect(within(sidebar).queryByText(/My card was charged/)).not.toBeInTheDocument()
  })

  it('shows "Uncategorised" and "Unassigned" when there is no category or assignee', async () => {
    mockGet({ ticket: { ...ticket, category: null, assignedTo: null } })
    renderPage()

    await screen.findByRole('heading', { name: ticket.subject })
    expect(screen.getByText('Category', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Uncategorised')
    expect(screen.getByText('Assigned to', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Unassigned')
  })

  it('shows the reply thread and the reply form below the opening email', async () => {
    mockGet()
    renderPage()

    const section = await screen.findByRole('region', { name: 'Replies' })
    expect(await within(section).findByText('Any update on my refund?')).toBeInTheDocument()
    expect(within(section).getByLabelText('Reply')).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Send reply' })).toBeInTheDocument()
    // The thread and form stay in the main column, not the sidebar.
    expect(within(screen.getByRole('complementary', { name: 'Ticket properties' })).queryByLabelText('Reply')).not.toBeInTheDocument()
  })

  it('shows the Summarize button below the ticket properties', async () => {
    mockGet()
    renderPage()

    const summarize = within(await screen.findByRole('region', { name: 'Ticket summary' })).getByRole('button', {
      name: 'Summarize',
    })
    const properties = screen.getByRole('complementary', { name: 'Ticket properties' })
    expect(properties.compareDocumentPosition(summarize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("requests the replies of the URL's ticket with an abort signal", async () => {
    const get = mockGet()
    renderPage()

    await screen.findByText('Any update on my refund?')
    expect(get).toHaveBeenCalledWith('/api/tickets/42/replies', { signal: expect.any(AbortSignal) })
  })

  it("doesn't show or request the replies while the ticket is loading", () => {
    const get = vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByText('Loading ticket…')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Replies' })).not.toBeInTheDocument()
    expect(get.mock.calls.filter(isRepliesRequest)).toHaveLength(0)
  })

  it('keeps the ticket on screen when only the replies fail to load', async () => {
    vi.spyOn(axios, 'get').mockImplementation(async (url: string) => {
      if (url.endsWith('/replies')) throw new Error('Request failed with status code 500')
      return { data: { ticket } }
    })
    renderPage()

    const section = await screen.findByRole('region', { name: 'Replies' })
    expect(await within(section).findByRole('alert')).toHaveTextContent('Failed to load replies. Please try again.')
    expect(screen.getByRole('heading', { level: 1, name: ticket.subject })).toBeInTheDocument()
    expect(screen.getByText(/My card was charged \$199 twice\./)).toBeInTheDocument()
    // Agents can still reply even if the thread didn't load.
    expect(within(section).getByRole('button', { name: 'Send reply' })).toBeInTheDocument()
    expect(screen.queryByText('Failed to load the ticket. Please try again.')).not.toBeInTheDocument()
  })

  it('shows "Ticket not found" when the server returns 404', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(notFoundError())
    renderPage('/tickets/999')

    expect(await screen.findByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it("doesn't show or request the replies when the ticket isn't found", async () => {
    const get = vi.spyOn(axios, 'get').mockRejectedValue(notFoundError())
    renderPage('/tickets/999')

    await screen.findByRole('heading', { name: 'Ticket not found' })
    expect(screen.queryByRole('region', { name: 'Replies' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Reply')).not.toBeInTheDocument()
    expect(get.mock.calls.filter(isRepliesRequest)).toHaveLength(0)
  })

  it('shows "Ticket not found" for a non-numeric id without calling the API', () => {
    const get = vi.spyOn(axios, 'get')
    renderPage('/tickets/abc')

    expect(screen.getByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  // 2147483648 is one past the largest Postgres INTEGER, so no ticket can have it.
  it.each(['0', '-3', '2147483648'])('shows "Ticket not found" for id %s without calling the API', (id) => {
    const get = vi.spyOn(axios, 'get')
    renderPage(`/tickets/${id}`)

    expect(screen.getByRole('heading', { name: 'Ticket not found' })).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  it('shows an error alert when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the ticket. Please try again.')
    expect(screen.queryByText('Loading ticket…')).not.toBeInTheDocument()
  })

  it('shows the error alert, not "Ticket not found", for errors other than 404', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(axiosError(400, 'Bad Request', 'Invalid ticket id'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the ticket. Please try again.')
    expect(screen.queryByRole('heading', { name: 'Ticket not found' })).not.toBeInTheDocument()
  })

  // Where it leads is covered in BackToTickets.test.tsx.
  it('shows a link back to the tickets list', async () => {
    mockGet()
    renderPage()
    await screen.findByRole('heading', { name: ticket.subject })

    expect(screen.getByRole('link', { name: 'Back to tickets' })).toBeInTheDocument()
  })
})
