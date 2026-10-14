import express, { type ErrorRequestHandler } from "express";
import { healthRouter } from "./routes/health";

export const app = express();

app.use(express.json());

app.use("/api/health", healthRouter);

// 404 for unmatched API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not Found", path: req.originalUrl });
});

// Express 5 forwards rejected promises from async handlers here automatically.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status: number = err.status ?? err.statusCode ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : err.message,
  });
};
app.use(errorHandler);
