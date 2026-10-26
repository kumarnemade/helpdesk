import { receiveEmailSchema } from "core";
import { Router } from "express";
import { ingestEmail } from "../ingestEmail";

export const inboundEmailRouter = Router();

inboundEmailRouter.post("/", async (req, res) => {
  const parsed = receiveEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const result = await ingestEmail(parsed.data);
  res.status(result.created ? 201 : 200).json(result);
});
