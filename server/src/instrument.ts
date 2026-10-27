import * as Sentry from "@sentry/bun";

// Error reporting to Sentry. Loaded with `bun --preload` so it runs before any
// other module. Optional: without SENTRY_DSN the SDK sends nothing. Errors
// only (no tracing). Tickets hold customer email, and the SDK collects most
// request and runtime data by default, so all of it is turned off: events
// carry the error, its stack trace and source lines, and the request's
// method and path.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "development",
  dataCollection: {
    userInfo: false, // also leaves out the client IP
    cookies: false,
    httpHeaders: false, // session cookie, webhook secret
    httpBodies: [],
    urlQueryParams: false, // ticket search terms
    stackFrameVariables: false, // email bodies, ticket data
    databaseQueryData: false,
    queues: false, // job payloads
    genAI: { inputs: false, outputs: false }, // prompts quote customer email
  },
});
