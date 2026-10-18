import { Navigate, Outlet } from 'react-router'
import { authClient } from '../lib/auth-client'

// Nested inside ProtectedLayout, so a session is already guaranteed here.
export function AdminRoute() {
  const { data: session } = authClient.useSession()

  if (session?.user.role !== 'admin') return <Navigate to="/" replace />

  return <Outlet />
}
