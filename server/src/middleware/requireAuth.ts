import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth, type AuthSession } from "../auth";

declare global {
  namespace Express {
    interface Locals {
      user: AuthSession["user"];
      session: AuthSession["session"];
    }
  }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const result = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!result) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  res.locals.user = result.user;
  res.locals.session = result.session;
  next();
};
