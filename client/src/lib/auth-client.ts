import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

// No baseURL: requests go to /api/auth on the page origin, which Vite proxies
// to the API in dev, so the session cookie stays same-origin.
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: { role: { type: 'string', required: false, input: false } },
    }),
  ],
})

export type SessionUser = typeof authClient.$Infer.Session.user
