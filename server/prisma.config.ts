// Run Prisma commands with `bun --bun prisma ...` (see package.json db:* scripts) so Bun loads .env.
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
