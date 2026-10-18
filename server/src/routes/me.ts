import { Router } from "express";

export const meRouter = Router();

meRouter.get("/", (_req, res) => {
  // Explicit fields so new user columns aren't exposed by default.
  const { id, name, email, image, role } = res.locals.user;
  res.json({ user: { id, name, email, image, role } });
});
