import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client'
import { queryClient } from '../lib/query-client'
import { FullPageLoader } from './FullPageLoader'
import { NavBar } from './NavBar'

export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const signedOut = !isPending && !session

  // Drop cached server data so the next user never sees the previous one's.
  // This runs after the redirect has unmounted the protected pages; clearing
  // while they're mounted would make their queries refetch and 401.
  useEffect(() => {
    if (signedOut) queryClient.clear()
  }, [signedOut])

  if (isPending) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-screen bg-background">
      <NavBar user={session.user} />
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  )
}
