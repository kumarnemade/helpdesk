import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { BackToTickets } from './BackToTickets'

// Shows where the back link went, so tests can check the list's query string.
function TicketsListProbe() {
  const { search } = useLocation()
  return <p>Tickets list{search}</p>
}

function renderLink(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/tickets/42', state }]}>
      <Routes>
        <Route path="/tickets/:id" element={<BackToTickets />} />
        <Route path="/tickets" element={<TicketsListProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('BackToTickets', () => {
  it('goes back to the list view it was opened from', async () => {
    const user = userEvent.setup()
    renderLink({ from: '?status=open&page=2' })

    await user.click(screen.getByRole('link', { name: 'Back to tickets' }))

    expect(screen.getByText('Tickets list?status=open&page=2')).toBeInTheDocument()
  })

  it('goes back to the plain list when opened directly', () => {
    renderLink()

    expect(screen.getByRole('link', { name: 'Back to tickets' })).toHaveAttribute('href', '/tickets')
  })
})
