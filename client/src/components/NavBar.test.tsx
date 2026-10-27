import axios from 'axios'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { renderWithQueryClient } from '@/test/render'
import { NavBar } from './NavBar'

const auth = vi.hoisted(() => ({ signOut: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: auth.signOut },
}))

function makeUser(role: 'admin' | 'agent', name: string) {
  return {
    id: `${role}-1`,
    name,
    email: `${role}@example.com`,
    role,
    emailVerified: true,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  } as SessionUser
}

const admin = makeUser('admin', 'Ada Admin')
const agent = makeUser('agent', 'Alan Agent')

function renderNavBar(user: SessionUser) {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={['/tickets']}>
      <Routes>
        <Route path="/tickets" element={<NavBar user={user} />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

// The open-ticket count comes from the tickets list filtered to Open.
function mockOpenTickets(total = 34) {
  return vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [], total } })
}

beforeEach(() => {
  auth.signOut.mockReset().mockResolvedValue({ data: { success: true }, error: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NavBar', () => {
  it('shows admins the Tickets and Users links, their name and a sign-out button', () => {
    mockOpenTickets()
    renderNavBar(admin)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /^Tickets/ })).toHaveAttribute('href', '/tickets')
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users')
    expect(within(nav).getByText('Ada Admin')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('shows agents the Tickets link but not the admin-only Users link', () => {
    mockOpenTickets()
    renderNavBar(agent)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: /^Tickets/ })).toHaveAttribute('href', '/tickets')
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    expect(within(nav).getByText('Alan Agent')).toBeInTheDocument()
  })

  it('links the Helpdesk brand and Dashboard to the home page', () => {
    mockOpenTickets()
    renderNavBar(agent)

    expect(screen.getByRole('link', { name: 'Helpdesk' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/')
  })

  it('marks the link to the current page', () => {
    mockOpenTickets()
    renderNavBar(agent)

    expect(screen.getByRole('link', { name: /^Tickets/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('shows the number of open tickets next to Tickets', async () => {
    const get = mockOpenTickets(34)
    renderNavBar(agent)

    const link = screen.getByRole('link', { name: /^Tickets/ })
    expect(await within(link).findByText(/34/)).toBeInTheDocument()
    expect(link).toHaveAccessibleName('Tickets, 34 open')
    expect(get).toHaveBeenCalledWith('/api/tickets', {
      params: expect.objectContaining({ status: 'open', page: 1 }),
      signal: expect.any(AbortSignal),
    })
  })

  it('shows no count while the count loads', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    renderNavBar(agent)

    expect(screen.getByRole('link', { name: 'Tickets' })).toBeInTheDocument()
  })

  it('has a theme switcher', () => {
    mockOpenTickets()
    renderNavBar(agent)

    expect(within(screen.getByRole('navigation')).getByRole('button', { name: 'Theme' })).toBeInTheDocument()
  })

  it('signs out, clears cached server data and goes to the login page', async () => {
    mockOpenTickets()
    const user = userEvent.setup()
    const clear = vi.spyOn(queryClient, 'clear')
    renderNavBar(agent)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(clear).toHaveBeenCalledTimes(1)
    clear.mockRestore()
  })

  it('disables the button while signing out', async () => {
    mockOpenTickets()
    const user = userEvent.setup()
    auth.signOut.mockReturnValue(new Promise(() => {}))
    renderNavBar(agent)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  })
})
