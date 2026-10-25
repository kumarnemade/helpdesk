import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
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
  return render(
    <MemoryRouter initialEntries={['/tickets']}>
      <Routes>
        <Route path="/tickets" element={<NavBar user={user} />} />
        <Route path="/login" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  auth.signOut.mockReset().mockResolvedValue({ data: { success: true }, error: null })
})

describe('NavBar', () => {
  it('shows admins the Tickets and Users links, their name and a sign-out button', () => {
    renderNavBar(admin)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets')
    expect(within(nav).getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/users')
    expect(within(nav).getByText('Ada Admin')).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: 'Sign out' })).toBeEnabled()
  })

  it('shows agents the Tickets link but not the admin-only Users link', () => {
    renderNavBar(agent)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Tickets' })).toHaveAttribute('href', '/tickets')
    expect(within(nav).queryByRole('link', { name: 'Users' })).not.toBeInTheDocument()
    expect(within(nav).getByText('Alan Agent')).toBeInTheDocument()
  })

  it('links the Helpdesk brand to the home page', () => {
    renderNavBar(agent)

    expect(screen.getByRole('link', { name: 'Helpdesk' })).toHaveAttribute('href', '/')
  })

  it('signs out, clears cached server data and goes to the login page', async () => {
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
    const user = userEvent.setup()
    auth.signOut.mockReturnValue(new Promise(() => {}))
    renderNavBar(agent)

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  })
})
