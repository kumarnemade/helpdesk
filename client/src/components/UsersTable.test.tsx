import axios from 'axios'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { UsersTable } from './UsersTable'

const users = [
  {
    id: 'u1',
    name: 'Ada Admin',
    email: 'ada@example.com',
    role: 'admin',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'u2',
    name: 'Alan Agent',
    email: 'alan@example.com',
    role: 'agent',
    createdAt: '2026-02-20T10:00:00.000Z',
  },
]

function mockGet() {
  return vi.spyOn(axios, 'get')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UsersTable', () => {
  it('renders the column headers', async () => {
    mockGet().mockResolvedValue({ data: { users } })
    renderWithQueryClient(<UsersTable />)

    for (const name of ['Name', 'Email', 'Role', 'Created', 'Actions']) {
      expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
    }
    await screen.findByText('Ada Admin')
  })

  it('requests /api/users with an abort signal', async () => {
    const get = mockGet().mockResolvedValue({ data: { users } })
    renderWithQueryClient(<UsersTable />)

    await screen.findByText('Ada Admin')
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/api/users', { signal: expect.any(AbortSignal) })
  })

  it('shows skeleton rows with an accessible loading label while pending', () => {
    mockGet().mockReturnValue(new Promise(() => {}))
    const { container } = renderWithQueryClient(<UsersTable />)

    expect(screen.getByText('Loading users…')).toBeInTheDocument()
    // Header row + 3 skeleton rows.
    expect(screen.getAllByRole('row')).toHaveLength(4)
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(15)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders a row per user with name, email, role and created date', async () => {
    mockGet().mockResolvedValue({ data: { users } })
    renderWithQueryClient(<UsersTable />)

    const adminRow = (await screen.findByText('Ada Admin')).closest('tr')!
    const agentRow = screen.getByText('Alan Agent').closest('tr')!

    const adminCells = within(adminRow).getAllByRole('cell')
    expect(adminCells[1]).toHaveTextContent('ada@example.com')
    expect(adminCells[2]).toHaveTextContent('admin')
    expect(adminCells[3]).toHaveTextContent(new Date(users[0]!.createdAt).toLocaleDateString())

    const agentCells = within(agentRow).getAllByRole('cell')
    expect(agentCells[1]).toHaveTextContent('alan@example.com')
    expect(agentCells[2]).toHaveTextContent('agent')

    expect(screen.queryByText('Loading users…')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('uses the default badge for admins and the secondary badge for agents', async () => {
    mockGet().mockResolvedValue({ data: { users } })
    renderWithQueryClient(<UsersTable />)

    const adminRow = (await screen.findByText('Ada Admin')).closest('tr')!
    const agentRow = screen.getByText('Alan Agent').closest('tr')!

    expect(within(adminRow).getByText('admin')).toHaveAttribute('data-variant', 'default')
    expect(within(agentRow).getByText('agent')).toHaveAttribute('data-variant', 'secondary')
  })

  it('shows a delete button for agents but not for admins', async () => {
    mockGet().mockResolvedValue({ data: { users } })
    renderWithQueryClient(<UsersTable />)

    expect(await screen.findByRole('button', { name: 'Delete Alan Agent' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Ada Admin' })).not.toBeInTheDocument()
  })

  it('shows the empty state when there are no users', async () => {
    mockGet().mockResolvedValue({ data: { users: [] } })
    renderWithQueryClient(<UsersTable />)

    expect(await screen.findByText('No users found.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error alert when the request fails', async () => {
    mockGet().mockRejectedValue(new Error('Request failed with status code 500'))
    renderWithQueryClient(<UsersTable />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load users. Please try again.')
    expect(screen.queryByText('Loading users…')).not.toBeInTheDocument()
  })
})
