import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { authClient, type SessionUser } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'

export function NavBar({ user }: { user: SessionUser }) {
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await authClient.signOut()
    // Drop cached server data so the next user never sees the previous one's.
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b bg-background">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Helpdesk
          </Link>
          <Link to="/tickets" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Tickets
          </Link>
          {user.role === 'admin' && (
            <Link to="/users" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Users
            </Link>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-muted-foreground">{user.name}</span>
          <Button variant="outline" onClick={handleSignOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </nav>
    </header>
  )
}
