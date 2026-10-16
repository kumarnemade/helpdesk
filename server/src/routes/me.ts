import { Router } from "express";

export const meRouter = Router();

meRouter.get("/", (_req, res) => {
  res.json({ user: res.locals.user });
});
