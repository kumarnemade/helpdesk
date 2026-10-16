import { authClient } from '../lib/auth-client'

export function HomePage() {
  const { data: session } = authClient.useSession()

  return (
    <div>
      <h1 className="text-2xl font-semibold">
        Welcome, {session?.user.name}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">You're signed in to Helpdesk.</p>
    </div>
  )
}
