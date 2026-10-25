-- AlterTable
ALTER TABLE "ticket" ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- Backfill: existing resolved/closed tickets don't record when they were
-- resolved, so estimate it with their last update.
UPDATE "ticket" SET "resolvedAt" = "updatedAt" WHERE "status" IN ('resolved', 'closed');
