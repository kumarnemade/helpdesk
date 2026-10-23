import axios from 'axios'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { TicketsPage } from './TicketsPage'

afterEach(() => {
  vi.restoreAllMocks()
})

// Table states are covered in TicketsTable.test.tsx; this only checks the page
// puts the heading and table together.
describe('TicketsPage', () => {
  it('renders the heading and the tickets table', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        tickets: [
          {
            id: 1,
            subject: 'Unable to access course materials',
            status: 'new',
            category: null,
            senderName: 'Jordan Lee',
            senderEmail: 'jordan.lee@example.com',
            createdAt: '2026-10-21T14:18:49.398Z',
            assignedTo: null,
          },
        ],
      },
    })
    renderWithQueryClient(<TicketsPage />)

    expect(screen.getByRole('heading', { name: 'Tickets' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'Unable to access course materials' })).toBeInTheDocument()
  })
})
