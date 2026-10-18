import { STATUS_CODES } from "node:http";
import express, { type ErrorRequestHandler } from "express";
import helmet from "helmet";
import { toNodeHandler } from "better-auth/node";
import { auth, CLIENT_IP_HEADER } from "./auth";
import { requireAuth } from "./middleware/requireAuth";
import { healthRouter } from "./routes/health";
import { meRouter } from "./routes/me";

export const app = express();

// Which proxies to trust for req.ip: a hop count ("1") or Express's address
// list ("loopback", "10.0.0.1"). Unset means trust none and use the socket address.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(helmet());

// Hand Better Auth the client IP Express resolved, overwriting anything the
// client sent in the same header.
app.use("/api/auth", (req, _res, next) => {
  delete req.headers[CLIENT_IP_HEADER];
  if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip;
  next();
});

// Must be mounted before express.json(), which would consume the request body.
app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.use("/api/health", healthRouter);
app.use("/api/me", requireAuth, meRouter);

// 404 for unmatched API routes
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not Found" });
});

// Express 5 forwards rejected promises from async handlers here automatically.
// Responses carry only the standard status text, so internal messages (e.g.
// body-parser's JSON syntax errors) never reach clients.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: STATUS_CODES[status] ?? "Error" });
};
app.use(errorHandler);
