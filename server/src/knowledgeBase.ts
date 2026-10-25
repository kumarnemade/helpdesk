import { join } from "node:path";

// Support policies and answers that AI auto-resolution may use, read once at
// startup. Edit server/knowledge-base.md and restart the server to change it.
export const knowledgeBase = (await Bun.file(join(import.meta.dir, "..", "knowledge-base.md")).text()).trim();
