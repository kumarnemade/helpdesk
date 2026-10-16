import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client'
import { FullPageLoader } from './FullPageLoader'
import { NavBar } from './NavBar'

export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-muted">
      <NavBar user={session.user} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
