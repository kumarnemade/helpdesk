import { authClient } from '../lib/auth-client'

export function HomePage() {
  const { data: session } = authClient.useSession()

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">
        Welcome, {session?.user.name}
      </h1>
      <p className="mt-2 text-sm text-gray-600">You're signed in to Helpdesk.</p>
    </div>
  )
}
