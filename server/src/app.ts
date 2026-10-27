import { existsSync } from "node:fs";
import { STATUS_CODES } from "node:http";
import { join } from "node:path";
import * as Sentry from "@sentry/bun";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth, CLIENT_IP_HEADER } from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { requireRole } from "./middleware/requireRole";
import { requireWebhookSecret } from "./middleware/requireWebhookSecret";
import { dashboardRouter } from "./routes/dashboard";
import { healthRouter } from "./routes/health";
import { inboundEmailRouter } from "./routes/inboundEmail";
import { meRouter } from "./routes/me";
import { ticketsRouter } from "./routes/tickets";
import { usersRouter } from "./routes/users";

export const app = express();

// Which proxies to trust for req.ip: a hop count ("1") or Express's address
// list ("loopback", "10.0.0.1"). Unset means trust none and use the socket address.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

// The default Content-Security-Policy, plus Sentry's ingest hosts so the
// client (served from here in production) can report errors.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { "connect-src": ["'self'", "https://*.sentry.io"] },
    },
  }),
);

// Header a proxy in front of the API always overwrites with the client IP
// (e.g. "cf-connecting-ip" on Render), used instead of req.ip when set. Only
// set it when every request passes through that proxy, or clients can fake it.
const clientIpHeader = process.env.CLIENT_IP_HEADER?.trim().toLowerCase() || undefined;

// Hand Better Auth the client IP, overwriting anything the client sent in the
// same header.
app.use("/api/auth", (req, _res, next) => {
  const ip = clientIpHeader ? req.get(clientIpHeader) : req.ip;
  delete req.headers[CLIENT_IP_HEADER];
  if (ip) req.headers[CLIENT_IP_HEADER] = ip;
  next();
});

// Must be mounted before express.json(), which would consume the request body.
app.all("/api/auth/*splat", toNodeHandler(auth));

// Mounted before the global express.json() so emails get a larger body limit
// than the default 100kb. Authenticated by a shared secret, not a session.
app.use(
  "/api/inbound-email",
  express.json({ limit: "1mb" }),
  requireWebhookSecret,
  inboundEmailRouter,
);

app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/me", requireAuth, meRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/tickets", requireAuth, ticketsRouter);
app.use("/api/users", requireAuth, requireRole("admin"), usersRouter);

// 404 for unmatched API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// In production (NODE_ENV=production) the built client (client/dist, from
// `bun run build`) is served from here, so the app and API share one origin.
// Vite's hashed assets are cached for a year; any other path gets index.html
// for React Router. In dev Vite serves the client instead.
const clientDist = join(import.meta.dir, "..", "..", "client", "dist");
if (process.env.NODE_ENV === "production" && existsSync(join(clientDist, "index.html"))) {
  // A missing asset (e.g. from a previous deploy) is a 404, not index.html.
  app.use("/assets", express.static(join(clientDist, "assets"), { immutable: true, maxAge: "1y", fallthrough: false }));
  app.use(express.static(clientDist, { index: false }));
  // `{…}` makes the wildcard optional, so "/" matches too.
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(join(clientDist, "index.html"));
  });
}

// Express 5 forwards rejected promises from async handlers here automatically.
// Responses carry only the standard status text, so internal messages (e.g.
// body-parser's JSON syntax errors) never reach clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = err.status ?? err.statusCode ?? 500;
  if (status >= 500) {
    console.error(err);
    Sentry.captureException(err);
  }
  res.status(status).json({ error: STATUS_CODES[status] ?? "Error" });
};
app.use(errorHandler);
