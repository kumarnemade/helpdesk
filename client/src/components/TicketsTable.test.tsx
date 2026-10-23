import axios from 'axios'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { TicketsTable } from './TicketsTable'

// Shows the current query string so tests can check filters reach the URL.
function LocationSearch() {
  return <output data-testid="location-search">{useLocation().search}</output>
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
    mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    for (const name of ['Subject', 'From', 'Status', 'Category', 'Assigned to', 'Received']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    await screen.findByText('Refund for duplicate charge')
  })

  it('requests /api/tickets newest first with an abort signal', async () => {
    const get = mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: { sortBy: 'createdAt', sortOrder: 'desc' },
      signal: expect.any(AbortSignal),
    })
  })

  it('marks Received as sorted descending by default', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute('aria-sort', 'descending')
    for (const name of ['Subject', 'From', 'Status', 'Category', 'Assigned to']) {
      expect(screen.getByRole('columnheader', { name })).toHaveAttribute('aria-sort', 'none')
    }
  })

  it('asks the server to sort by a column, ascending then descending', async () => {
    const user = userEvent.setup()
    const get = mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()
    await screen.findByText('Refund for duplicate charge')

    await user.click(screen.getByRole('button', { name: 'Subject' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'asc' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute('aria-sort', 'none')

    await user.click(screen.getByRole('button', { name: 'Subject' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'subject', sortOrder: 'desc' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(screen.getByRole('columnheader', { name: 'Subject' })).toHaveAttribute('aria-sort', 'descending')
  })

  it('sorts the assignee column by the server-side assignedTo field', async () => {
    const user = userEvent.setup()
    const get = mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()
    await screen.findByText('Refund for duplicate charge')

    await user.click(screen.getByRole('button', { name: 'Assigned to' }))
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/api/tickets', {
        params: { sortBy: 'assignedTo', sortOrder: 'asc' },
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('renders the re-sorted rows in the order the server returns them', async () => {
    const user = userEvent.setup()
    const bySubject = [tickets[1]!, tickets[2]!, tickets[0]!].sort((a, b) => a.subject.localeCompare(b.subject))
    mockGet()
      .mockResolvedValueOnce({ data: { tickets } })
      .mockResolvedValueOnce({ data: { tickets: bySubject } })
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
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(18)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders tickets in the order returned, newest first', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    const [, ...rows] = screen.getAllByRole('row')
    expect(rows.map((row) => within(row).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Refund for duplicate charge',
      'Unable to access course materials',
      'How do I reset my password?',
    ])
  })

  it('renders sender, status, category, assignee and received date', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    const assignedRow = (await screen.findByText('Refund for duplicate charge')).closest('tr')!
    const assignedCells = within(assignedRow).getAllByRole('cell')
    expect(assignedCells[1]).toHaveTextContent('Priya Shah')
    expect(assignedCells[1]).toHaveTextContent('priya@example.com')
    expect(assignedCells[2]).toHaveTextContent('Open')
    expect(assignedCells[3]).toHaveTextContent('Refund request')
    expect(assignedCells[4]).toHaveTextContent('Alan Agent')
    expect(assignedCells[5]).toHaveTextContent(new Date(tickets[0]!.createdAt).toLocaleDateString())

    const newRow = screen.getByText('Unable to access course materials').closest('tr')!
    const newCells = within(newRow).getAllByRole('cell')
    expect(newCells[2]).toHaveTextContent('New')
    expect(newCells[3]).toHaveTextContent('—')
    expect(newCells[4]).toHaveTextContent('Unassigned')

    expect(screen.queryByText('Loading tickets…')).not.toBeInTheDocument()
  })

  it('uses a badge variant per status', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderTable()

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByText('New')).toHaveAttribute('data-variant', 'default')
    expect(screen.getByText('Open')).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByText('Closed')).toHaveAttribute('data-variant', 'outline')
  })

  it('shows the empty state when there are no tickets', async () => {
    mockGet().mockResolvedValue({ data: { tickets: [] } })
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
      mockGet().mockResolvedValue({ data: { tickets } })
      renderTable()

      await screen.findByText('Refund for duplicate charge')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
      expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
    })

    it('reads filters from the URL and sends them to the server', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets: [tickets[1]!] } })
      renderTable('/tickets?status=new&category=none')

      await screen.findByText('Unable to access course materials')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { status: 'new', category: 'none', sortBy: 'createdAt', sortOrder: 'desc' },
        signal: expect.any(AbortSignal),
      })
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('New')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('Uncategorised')
    })

    it('ignores invalid filter values in the URL', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?status=bogus&category=spam')

      await screen.findByText('Refund for duplicate charge')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { sortBy: 'createdAt', sortOrder: 'desc' },
        signal: expect.any(AbortSignal),
      })
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('All statuses')
    })

    it('filters by status on the server and puts it in the URL', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Status', 'Closed')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { status: 'closed', sortBy: 'createdAt', sortOrder: 'desc' },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toHaveTextContent('?status=closed')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveTextContent('Closed')
    })

    it('filters uncategorised tickets with category=none', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Category', 'Uncategorised')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { category: 'none', sortBy: 'createdAt', sortOrder: 'desc' },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toHaveTextContent('?category=none')
    })

    it('removes a filter when "All" is chosen again', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?status=open')
      await screen.findByText('Refund for duplicate charge')

      await chooseOption('Status', 'All statuses')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc' },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })

    it('keeps the sort order when filtering', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?category=refund_request')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Subject' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { category: 'refund_request', sortBy: 'subject', sortOrder: 'asc' },
          signal: expect.any(AbortSignal),
        }),
      )
    })

    it('shows a filtered empty state when nothing matches', async () => {
      mockGet().mockResolvedValue({ data: { tickets: [] } })
      renderTable('/tickets?status=closed')

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
      expect(screen.queryByText('No tickets yet.')).not.toBeInTheDocument()
    })

    it('clears all filters', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?status=resolved&category=general_question')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc' },
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
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), 'Refund')

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { search: 'Refund', sortBy: 'createdAt', sortOrder: 'desc' },
          signal: expect.any(AbortSignal),
        }),
      )
      // Debounced: one request for the whole word, not one per keystroke.
      expect(searchCalls(get)).toHaveLength(1)
      expect(screen.getByTestId('location-search')).toHaveTextContent('?search=Refund')
      expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
    })

    it('reads the search from the URL, keeping its case for the server', async () => {
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?search=PRIYA')

      await screen.findByText('Refund for duplicate charge')
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('PRIYA')
      expect(get).toHaveBeenCalledWith('/api/tickets', {
        params: { search: 'PRIYA', sortBy: 'createdAt', sortOrder: 'desc' },
        signal: expect.any(AbortSignal),
      })
    })

    it('does not send a search made only of spaces', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable()
      await screen.findByText('Refund for duplicate charge')

      await user.type(screen.getByRole('searchbox', { name: 'Search tickets' }), '   ')

      await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent('?search='))
      expect(searchCalls(get)).toHaveLength(0)
    })

    it('combines the search with filters and sorting', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?search=gmail.com&status=open')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'From' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { search: 'gmail.com', status: 'open', sortBy: 'senderName', sortOrder: 'asc' },
          signal: expect.any(AbortSignal),
        }),
      )
    })

    it('shows the filtered empty state when the search matches nothing', async () => {
      mockGet().mockResolvedValue({ data: { tickets: [] } })
      renderTable('/tickets?search=zzz')

      expect(await screen.findByText('No tickets match these filters.')).toBeInTheDocument()
    })

    it('clears the search box and filters together', async () => {
      const user = userEvent.setup()
      const get = mockGet().mockResolvedValue({ data: { tickets } })
      renderTable('/tickets?search=refund&category=refund_request')
      await screen.findByText('Refund for duplicate charge')

      await user.click(screen.getByRole('button', { name: 'Clear filters' }))

      await waitFor(() =>
        expect(get).toHaveBeenLastCalledWith('/api/tickets', {
          params: { sortBy: 'createdAt', sortOrder: 'desc' },
          signal: expect.any(AbortSignal),
        }),
      )
      expect(screen.getByRole('searchbox', { name: 'Search tickets' })).toHaveValue('')
      expect(screen.getByRole('combobox', { name: 'Category' })).toHaveTextContent('All categories')
      expect(screen.getByTestId('location-search')).toBeEmptyDOMElement()
    })
  })
})
