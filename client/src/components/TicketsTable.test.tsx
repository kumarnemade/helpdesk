import axios from 'axios'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { TicketsTable } from './TicketsTable'

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
    renderWithQueryClient(<TicketsTable />)

    for (const name of ['Subject', 'From', 'Status', 'Category', 'Assigned to', 'Received']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    await screen.findByText('Refund for duplicate charge')
  })

  it('requests /api/tickets newest first with an abort signal', async () => {
    const get = mockGet().mockResolvedValue({ data: { tickets } })
    renderWithQueryClient(<TicketsTable />)

    await screen.findByText('Refund for duplicate charge')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: { sortBy: 'createdAt', sortOrder: 'desc' },
      signal: expect.any(AbortSignal),
    })
  })

  it('marks Received as sorted descending by default', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderWithQueryClient(<TicketsTable />)

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByRole('columnheader', { name: 'Received' })).toHaveAttribute('aria-sort', 'descending')
    for (const name of ['Subject', 'From', 'Status', 'Category', 'Assigned to']) {
      expect(screen.getByRole('columnheader', { name })).toHaveAttribute('aria-sort', 'none')
    }
  })

  it('asks the server to sort by a column, ascending then descending', async () => {
    const user = userEvent.setup()
    const get = mockGet().mockResolvedValue({ data: { tickets } })
    renderWithQueryClient(<TicketsTable />)
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
    renderWithQueryClient(<TicketsTable />)
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
    renderWithQueryClient(<TicketsTable />)
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
    const { container } = renderWithQueryClient(<TicketsTable />)

    expect(screen.getByText('Loading tickets…')).toBeInTheDocument()
    // Header row + 3 skeleton rows.
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(18)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders tickets in the order returned, newest first', async () => {
    mockGet().mockResolvedValue({ data: { tickets } })
    renderWithQueryClient(<TicketsTable />)

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
    renderWithQueryClient(<TicketsTable />)

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
    renderWithQueryClient(<TicketsTable />)

    await screen.findByText('Refund for duplicate charge')
    expect(screen.getByText('New')).toHaveAttribute('data-variant', 'default')
    expect(screen.getByText('Open')).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByText('Closed')).toHaveAttribute('data-variant', 'outline')
  })

  it('shows the empty state when there are no tickets', async () => {
    mockGet().mockResolvedValue({ data: { tickets: [] } })
    renderWithQueryClient(<TicketsTable />)

    expect(await screen.findByText('No tickets yet.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error alert when the request fails', async () => {
    mockGet().mockRejectedValue(new Error('Request failed with status code 500'))
    renderWithQueryClient(<TicketsTable />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load tickets. Please try again.')
    expect(screen.queryByText('Loading tickets…')).not.toBeInTheDocument()
  })
})
