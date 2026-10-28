import { useState } from 'react'
import { Link, NavLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { DEFAULT_TICKET_PAGE_SIZE, type ListTicketsQuery } from 'core'
import { InboxIcon, LayoutDashboardIcon, LogOutIcon, UsersIcon } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { authClient, type SessionUser } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { fetchTickets, ticketsListQueryKey } from '@/lib/tickets'

// Same query as the tickets list filtered to Open, so the two share a cache
// entry, and ticket edits (which invalidate ["tickets"]) refresh the count.
const OPEN_TICKETS_QUERY: ListTicketsQuery = {
  status: 'open',
  sortBy: 'createdAt',
  sortOrder: 'desc',
  page: 1,
  pageSize: DEFAULT_TICKET_PAGE_SIZE,
}

const LINK_CLASSES =
  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0'

// The app's navigation: a navy bar across the top (the `sidebar` theme
// tokens), whose links wrap onto a second row on narrow screens.
export function NavBar({ user }: { user: SessionUser }) {
  const [signingOut, setSigningOut] = useState(false)
  const { data: openTickets } = useQuery({
    queryKey: ticketsListQueryKey(OPEN_TICKETS_QUERY),
    queryFn: ({ signal }) => fetchTickets(OPEN_TICKETS_QUERY, signal),
  })

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    // Drop cached server data so the next user never sees the previous one's.
    queryClient.clear()
    // No navigate here: useSession still holds the old session for a moment,
    // so /login would bounce back to the dashboard (which then 401s).
    // ProtectedLayout redirects once Better Auth clears the session.
  }

  return (
    <header className="border-b border-sidebar-border bg-sidebar text-sidebar-foreground">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 md:px-8">
        <Link
          to="/"
          className="rounded-md py-1 text-lg font-semibold tracking-tight text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-sidebar-ring"
        >
          Helpdesk
        </Link>
        <ul className="order-last flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto">
          <li>
            <NavLink to="/" end className={LINK_CLASSES}>
              <LayoutDashboardIcon aria-hidden="true" />
              Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/tickets"
              className={LINK_CLASSES}
              aria-label={openTickets ? `Tickets, ${openTickets.total.toLocaleString()} open` : undefined}
            >
              <InboxIcon aria-hidden="true" />
              Tickets
              {openTickets && (
                <span
                  aria-hidden="true"
                  className="rounded-full bg-status-open px-2 text-xs font-semibold text-sidebar"
                >
                  {openTickets.total.toLocaleString()}
                </span>
              )}
            </NavLink>
          </li>
          {user.role === 'admin' && (
            <li>
              <NavLink to="/users" className={LINK_CLASSES}>
                <UsersIcon aria-hidden="true" />
                Users
              </NavLink>
            </li>
          )}
        </ul>

        <div className="ml-auto flex items-center gap-1">
          <span className="truncate px-2 text-sm font-medium text-sidebar-foreground/75">{user.name}</span>
          <ThemeToggle className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-label={signingOut ? 'Signing out…' : 'Sign out'}
            className="text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOutIcon aria-hidden="true" />
          </Button>
        </div>
      </nav>
    </header>
  )
}
