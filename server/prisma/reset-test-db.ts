// Drops, re-migrates and re-seeds the e2e test database. Run with
// `bun run db:test:reset` from server/, which sets NODE_ENV=test so Bun loads
// .env.test (its values override .env).
import { $ } from "bun";

const url = process.env.DATABASE_URL;
const database = url ? new URL(url).pathname.slice(1) : "";
// Guard against wiping the dev database if .env.test is missing or incomplete.
if (process.env.NODE_ENV !== "test" || !database.endsWith("_test")) {
  throw new Error(
    `Refusing to reset "${database}": NODE_ENV must be "test" and the database name must end in _test (see server/.env.test.example)`,
  );
}

// Prisma 7's migrate reset no longer runs the seed, so seed explicitly.
await $`bun --bun prisma migrate reset --force`;
await $`bun --bun prisma db seed`;
