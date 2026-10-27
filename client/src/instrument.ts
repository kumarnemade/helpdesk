import * as Sentry from '@sentry/react'

// Error reporting to Sentry; imported first in main.tsx. Optional: without
// VITE_SENTRY_DSN the SDK sends nothing. Errors only (no tracing or replay).
// The SDK collects user and request data by default; it's turned off, since
// pages show customer email and the URL holds ticket search terms.
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  dataCollection: {
    userInfo: false, // also leaves out the IP
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
})
