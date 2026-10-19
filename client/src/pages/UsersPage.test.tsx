import axios from 'axios'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { UsersPage } from './UsersPage'

afterEach(() => {
  vi.restoreAllMocks()
})

// Table states are covered in UsersTable.test.tsx and the create flow in
// CreateUserDialog.test.tsx; this only checks the page puts them together.
describe('UsersPage', () => {
  it('renders the heading, the create button and the users table', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        users: [
          { id: 'u1', name: 'Ada Admin', email: 'ada@example.com', role: 'admin', createdAt: '2026-01-15T10:00:00.000Z' },
        ],
      },
    })
    renderWithQueryClient(<UsersPage />)

    expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create user' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Ada Admin' })).toBeInTheDocument()
  })
})
