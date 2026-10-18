import type { RequestHandler } from "express";
import type { AuthSession } from "../auth";

type Role = NonNullable<AuthSession["user"]["role"]>;

// Mount after requireAuth. The role comes from the database-backed session,
// never from the request.
export const requireRole =
  (role: Role): RequestHandler =>
  (_req, res, next) => {
    if (res.locals.user.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
