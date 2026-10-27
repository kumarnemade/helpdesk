import axios from 'axios'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { TicketsTable } from './TicketsTable'

// Shows the current query string so tests can check filters reach the URL.
function LocationSearch() {
  return <output data-testid="location-search">{useLocation().search}</output>
}

// Stands in for the detail page: shows the path and the router state it got.
function TicketPageProbe() {
  const { pathname, state } = useLocation()
  return <p>{`Ticket page ${pathname} from ${(state as { from: string } | null)?.from}`}</p>
}

function renderTable(url = '/tickets') {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={[url]}>
      <TicketsTable />
      <LocationSearch />
    </MemoryRouter>,
  )
}

async function chooseOption(label: string, option: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: label }))
  await user.click(await screen.findByRole('option', { name: option }))
}

// Newest first, as the API returns them.
const tickets = [
  {
    id: 3,
    subject: 'Refund for duplicate charge',
    status: 'open',
    category: 'refund_request',
    senderName: 'Priya Shah',
    senderEmail: 'priya@example.com',
    createdAt: '2026-10-21T09:30:00.000Z',
    assignedTo: { id: 'u2', name: 'Alan Agent' },
  },
  {
    id: 2,
    subject: 'Unable to access course materials',
    status: 'new',
    category: null,
    senderName: 'Jordan Lee',
    senderEmail: 'jordan.lee@example.com',
    createdAt: '2026-10-20T14:00:00.000Z',
    assignedTo: null,
  },
  {
    id: 1,
    subject: 'How do I reset my password?',
    status: 'closed',
    category: 'general_question',
    senderName: 'Sam Rivera',
    senderEmail: 'sam@example.com',
    createdAt: '2026-10-18T08:15:00.000Z',
    assignedTo: null,
  },
]

function mockGet() {
  return vi.spyOn(axios, 'get')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TicketsTable', () => {
  it('renders the column headers', async () => {
    mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    for (const name of ['Subject', 'From', 'Status', 'Category', 'Received']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    // Assignees are shown and changed on the ticket page only.
    expect(screen.queryByRole('columnheader', { name: 'Assigned to' })).not.toBeInTheDocument()
    await screen.findByText('Refund for duplicate charge')
  })

  it('requests /api/tickets newest first with an abort signal', async () => {
    const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
      signal: expect.any(AbortSignal),
    })
  })

  it('marks Received as sorted descending by default', async () => {
    mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute('aria-sort', 'descending')
    for (const name of ['Subject', 'From', 'Status', 'Category']) {
      expect(screen.getByRole('columnheader', { name })).toHaveAttribute('aria-sort', 'none')
    }
  })

  it('asks the server to sort by a column, ascending then descending', async () => {
    const user = userEvent.setup()
    const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()
    await screen.findByText('Refund for duplicate charge')

    await user.click(screen.getByRole('button', { name: 'Subject' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc', page: 1, pageSize: 10 },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute('aria-sort', 'none')

    await user.click(screen.getByRole('button', { name: 'Subject' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'desc', page: 1, pageSize: 10 },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('renders the re-sorted rows in the order the server returns them', async () => {
    const user = userEvent.setup()
    const bySubject = [tickets[1]!, tickets[2]!, tickets[0]!].sort((a, b) => a.subject.localeCompare(b.subject))
    mockGet()
      .mockResolvedValueOnce({ data: { tickets, total: tickets.length } })
      .mockResolvedValueOnce({ data: { tickets: bySubject, total: bySubject.length } })
    renderTable()
    await screen.findByText('Refund for duplicate charge')

    await user.click(screen.getByRole('button', { name: 'Subject' }))
    await waitFor(() => {
      const [, ...rows] = screen.getAllByRole('row')
      expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
        'How do I reset my password?',
        'Refund for duplicate charge',
        'Unable to access course materials',
      ])
    })
  })

  it('shows skeleton rows with an accessible loading label while pending', () => {
    mockGet().mockReturnValue(new Promise(() => {}))
    const { container } = renderTable()

    expect(screen.getByText('Loading tickets…')).toBeInTheDocument()
    // Header row + 3 skeleton rows.
    expect(screen.getAllByRole('row')).toHaveLength(4)
    // 3 rows × 5 columns.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(15)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders tickets in the order returned, newest first', async () => {
    mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    const [, ...rows] = screen.getAllByRole('row')
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Refund for duplicate charge',
      'Unable to access course materials',
      'How do I reset my password?',
    ])
  })

  it('renders sender, status, category and received date', async () => {
    mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    const assignedRow = (await screen.findByText('Refund for duplicate charge')).closest('tr')!
    const assignedCells = within(assignedRow).getAllByRole('cell')
    expect(assignedCells[1]).toHaveTextContent('Priya Shah')
    expect(assignedCells[1]).toHaveTextContent('priya@example.com')
    expect(assignedCells[2]).toHaveTextContent('Open')
    expect(assignedCells[3]).toHaveTextContent('Refund Request')
    expect(assignedCells[4]).toHaveTextContent(new Date(tickets[0]!.createdAt).toLocaleDateString())

    const newRow = screen.getByText('Unable to access course materials').closest('tr')!
    const newCells = within(newRow).getAllByRole('cell')
    expect(newCells[2]).toHaveTextContent('New')
    expect(newCells[3]).toHaveTextContent('—')

    expect(screen.queryByText('Loading tickets…')).not.toBeInTheDocument()
  })

  it('links each subject to the ticket page, passing the list view along', async () => {
    const user = userEvent.setup()
    // Enough tickets for a page 2, so the list doesn't move back to page 1.
    mockGet().mockResolvedValue({ data: { tickets, total: 25 } })
    renderWithQueryClient(
      <MemoryRouter initialEntries={['/tickets?status=open&page=2']}>
        <Routes>
          <Route path="/tickets" element={<TicketsTable />} />
          <Route path="/tickets/:id" element={<TicketPageProbe />} />
        </Routes>
      </MemoryRouter>,
    )

    const link = await screen.findByRole('link', { name: 'Refund for duplicate charge' })
    expect(link).toHaveAttribute('href', '/tickets/3')

    await user.click(link)

    expect(screen.getByText('Ticket page /tickets/3 from ?status=open&page=2')).toBeInTheDocument()
  })

  it('shows each status as a lamp with its label', async () => {
    mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByText('New')).toHaveAttribute('data-status', 'new')
    expect(screen.getByText('Open')).toHaveAttribute('data-status', 'open')
    expect(screen.getByText('Closed')).toHaveAttribute('data-status', 'closed')
  })

  it('shows the empty state when there are no tickets', async () => {
    mockGet().mockResolvedValue({ data: { tickets: [], total: 0 } })
    renderTable()

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error alert when the request fails', async () => {
    mockGet().mockRejectedValue(new Error('Request failed with status code 500'))
    renderTable()

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tickets. Please try again.')
    expect(screen.queryByText('Loading tickets…')).not.toBeInTheDocument()
  })

  describe('filters', () => {
    it('shows both filters as "All" with no Clear button by default', async () => {
      mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable()

      await screen.findByText('Refund for duplicate charge')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('reads filters from the URL and sends them to the server', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets: [tickets[1]!], total: 1 } })
      renderTable('/tickets?status=new&category=none')

      await screen.findByText('Unable to access course materials')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { status: 'new', category: 'none', sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
        signal: expect.any(AbortSignal),
      })
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('New')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Uncategorised')
    })

    it('ignores invalid filter values in the URL', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?status=bogus&category=spam')

      await screen.findByText('Refund for duplicate charge')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
        signal: expect.any(AbortSignal),
      })
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
    })

    it('filters by status on the server and puts it in the URL', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Status', 'Closed')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { status: 'closed', sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=closed')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Closed')
    })

    it('filters uncategorised tickets with category=none', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Category', 'Uncategorised')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { category: 'none', sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toHaveTextContent('?category=none')
    })

    it('removes a filter when "All" is chosen again', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?status=open')
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Status', 'All statuses')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })

    it('keeps the sort order when filtering', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?category=refund_request')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Subject' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { category: 'refund_request', sortBy: 'subject', sortOrder: 'asc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
    })

    it('shows a filtered empty state when nothing matches', async () => {
      mockGet().mockResolvedValue({ data: { tickets: [], total: 0 } })
      renderTable('/tickets?status=closed')

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
      expect(screen.queryByText('No tickets yet.')).not.toBeInTheDocument()
    })

    it('clears all filters', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?status=resolved&category=general_question')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })
  })

  describe('search', () => {
    // Requests that included a search term.
    function searchCalls(get: ReturnType<typeof mockGet>) {
      return get.mock.calls.filter(([, config]) => (config as { params?: { search?: string } }).params?.search)
    }

    it('searches on the server once typing pauses and puts it in the URL', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'Refund')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { search: 'Refund', sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      // Debounced: one request for the whole word, not one per keystroke.
      expect(searchCalls(get)).toHaveLength(1)
      expect(screen.getByTestId('location-search')).toHaveTextContent('?search=Refund')
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    })

    it('reads the search from the URL, keeping its case for the server', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?search=PRIYA')

      await screen.findByText('Refund for duplicate charge')
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('PRIYA')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { search: 'PRIYA', sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
        signal: expect.any(AbortSignal),
      })
    })

    it('does not send a search made only of spaces', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '   ')

      await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('?search='))
      expect(searchCalls(get)).toHaveLength(0)
    })

    it('combines the search with filters and sorting', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?search=gmail.com&status=open')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'From' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { search: 'gmail.com', status: 'open', sortBy: 'senderName', sortOrder: 'asc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
    })

    it('shows the filtered empty state when the search matches nothing', async () => {
      mockGet().mockResolvedValue({ data: { tickets: [], total: 0 } })
      renderTable('/tickets?search=zzz')

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
    })

    it('clears the search box and filters together', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets, total: tickets.length } })
      renderTable('/tickets?search=refund&category=refund_request')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc', page: 1, pageSize: 10 },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })
  })

  describe('pagination', () => {
    // 23 tickets → 3 pages of 10. The mock serves whichever page is requested,
    // like the server: a page past the end is empty but keeps the total.
    const manyTickets = Array.from({ length: 23 }, (_, i) => ({
      ...tickets[0]!,
      id: 100 - i,
      subject: `Ticket number ${i + 1}`,
    }))

    function mockPages() {
      return mockGet().mockImplementation((_url, config) => {
        const { page = 1, pageSize = 10 } = (config as { params: { page?: number; pageSize?: number } }).params
        const start = (page - 1) * pageSize
        return Promise.resolve({
          data: { tickets: manyTickets.slice(start, start + pageSize), total: manyTickets.length },
        })
      })
    }

    function lastParams(get: ReturnType<typeof mockGet>) {
      return (get.mock.lastCall?.[1] as { params: Record<string, unknown> }).params
    }

    it('shows the range, page count and disabled buttons on the first page', async () => {
      mockPages()
      renderTable()

      await screen.findByText('Ticket number 1')
      expect(screen.getAllByRole('row')).toHaveLength(11)
      expect(screen.getByText('Showing 1–10 of 23 tickets')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to first page' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Go to last page' })).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('10')
    })

    it('requests the next page from the server and puts it in the URL', async () => {
      const user = userEvent.setup()
      const get = mockPages()
      renderTable()
      await screen.findByText('Ticket number 1')

      await user.click(screen.getByRole('button', { name: 'Go to next page' }))

      expect(await screen.findByText('Ticket number 11')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 2, pageSize: 10 })
      expect(screen.getByTestId('location-search')).toHaveTextContent('?page=2')
      expect(screen.getByText('Showing 11–20 of 23 tickets')).toBeInTheDocument()
      expect(screen.getByText('Page 2 of 3')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeEnabled()
    })

    it('jumps to the last page and back to the first', async () => {
      const user = userEvent.setup()
      const get = mockPages()
      renderTable()
      await screen.findByText('Ticket number 1')

      await user.click(screen.getByRole('button', { name: 'Go to last page' }))

      expect(await screen.findByText('Ticket number 21')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 3 })
      expect(screen.getByText('Showing 21–23 of 23 tickets')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Go to last page' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Go to first page' }))

      expect(await screen.findByText('Ticket number 1')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 1 })
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })

    it('reads the page from the URL', async () => {
      const get = mockPages()
      renderTable('/tickets?page=3')

      expect(await screen.findByText('Ticket number 21')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 3, pageSize: 10 })
      expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    })

    it('reads the page size from the URL', async () => {
      const get = mockPages()
      renderTable('/tickets?pageSize=25')

      expect(await screen.findByText('Ticket number 23')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 1, pageSize: 25 })
      expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveTextContent('25')
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    })

    it('ignores invalid page values in the URL', async () => {
      const get = mockPages()
      renderTable('/tickets?page=abc&pageSize=7')

      await screen.findByText('Ticket number 1')
      expect(lastParams(get)).toMatchObject({ page: 1, pageSize: 10 })
    })

    it('changing the rows per page goes back to page 1', async () => {
      const get = mockPages()
      renderTable('/tickets?page=2')
      await screen.findByText('Ticket number 11')

      await chooseOption('Rows per page', '25')

      expect(await screen.findByText('Ticket number 23')).toBeInTheDocument()
      expect(lastParams(get)).toMatchObject({ page: 1, pageSize: 25 })
      expect(screen.getByTestId('location-search')).toHaveTextContent('?pageSize=25')
      expect(screen.getByText('Showing 1–23 of 23 tickets')).toBeInTheDocument()
      expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    })

    it('changing a filter goes back to page 1', async () => {
      const get = mockPages()
      renderTable('/tickets?page=3')
      await screen.findByText('Ticket number 21')

      await chooseOption('Status', 'Open')

      await waitFor(() => expect(lastParams(get)).toMatchObject({ status: 'open', page: 1 }))
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=open')
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('page=')
    })

    it('changing the search goes back to page 1', async () => {
      const user = userEvent.setup()
      const get = mockPages()
      renderTable('/tickets?page=2')
      await screen.findByText('Ticket number 11')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'number')

      await waitFor(() => expect(lastParams(get)).toMatchObject({ search: 'number', page: 1 }))
      expect(screen.getByTestId('location-search')).not.toHaveTextContent('page=')
    })

    it('changing the sort goes back to page 1', async () => {
      const user = userEvent.setup()
      const get = mockPages()
      renderTable('/tickets?page=2')
      await screen.findByText('Ticket number 11')

      await user.click(screen.getByRole('button', { name: 'Subject' }))

      await waitFor(() => expect(lastParams(get)).toMatchObject({ sortBy: 'subject', page: 1 }))
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })

    it('moves to the last page when the URL asks for a page past the end', async () => {
      const get = mockPages()
      renderTable('/tickets?page=9')

      expect(await screen.findByText('Ticket number 21')).toBeInTheDocument()
      expect(get).toHaveBeenCalledWith('/api/tickets', expect.objectContaining({ params: expect.objectContaining({ page: 9 }) }))
      expect(lastParams(get)).toMatchObject({ page: 3 })
      expect(screen.getByTestId('location-search')).toHaveTextContent('?page=3')
      expect(screen.getByText('Page 3 of 3')).toBeInTheDocument()
    })

    it('hides the pagination bar when there are no tickets or the request fails', async () => {
      mockGet().mockResolvedValue({ data: { tickets: [], total: 0 } })
      const { unmount } = renderTable()
      await screen.findByText('No tickets yet.')
      expect(screen.queryByRole('button', { name: 'Go to next page' })).not.toBeInTheDocument()
      unmount()

      mockGet().mockRejectedValue(new Error('Request failed with status code 500'))
      renderTable()
      await screen.findByRole('alert')
      expect(screen.queryByRole('button', { name: 'Go to next page' })).not.toBeInTheDocument()
    })
  })
})
