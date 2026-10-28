import axios from 'axios'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { renderWithQueryClient } from '@/test/render'
import { ProtectedLayout } from './ProtectedLayout'

const auth = vi.hoisted(() => ({ useSession: vi.fn(), signOut: vi.fn() }))

vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: auth.useSession, signOut: auth.signOut },
}))

const user = {
  id: 'agent-1',
  name: 'Alan Agent',
  email: 'agent@example.com',
  role: 'agent',
  emailVerified: true,
  image: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
  updatedAt: new Date('2026-10-01T00:00:00.000Z'),
} as SessionUser

const routes = () => (
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<p>Dashboard page</p>} />
      </Route>
      <Route path="/login" element={<p>Login page</p>} />
    </Routes>
  </MemoryRouter>
)

beforeEach(() => {
  auth.useSession.mockReset()
  // NavBar loads the open-ticket count.
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { tickets: [], total: 0 } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ProtectedLayout', () => {
  it('shows a loader while the session is loading', () => {
    auth.useSession.mockReturnValue({ data: null, isPending: true })
    renderWithQueryClient(routes())

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
  })

  it('shows the page with the navigation when signed in', () => {
    auth.useSession.mockReturnValue({ data: { user, session: {} }, isPending: false })
    renderWithQueryClient(routes())

    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })

  it('keeps cached server data while signed in', () => {
    const clear = vi.spyOn(queryClient, 'clear')
    auth.useSession.mockReturnValue({ data: { user, session: {} }, isPending: false })
    renderWithQueryClient(routes())

    expect(clear).not.toHaveBeenCalled()
  })

  it('redirects to the login page when there is no session', () => {
    auth.useSession.mockReturnValue({ data: null, isPending: false })
    renderWithQueryClient(routes())

    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('redirects to the login page and clears cached data once the session is cleared (sign-out)', async () => {
    const clear = vi.spyOn(queryClient, 'clear')
    auth.useSession.mockReturnValue({ data: { user, session: {} }, isPending: false })
    // Own provider so rerender keeps it.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const withClient = () => <QueryClientProvider client={client}>{routes()}</QueryClientProvider>
    const { rerender } = render(withClient())
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()

    auth.useSession.mockReturnValue({ data: null, isPending: false })
    rerender(withClient())

    expect(await screen.findByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
    expect(clear).toHaveBeenCalledTimes(1)
  })
})
