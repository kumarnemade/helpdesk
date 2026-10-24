-- Data-only: deleting a user now unassigns their tickets (DELETE /api/users/:id).
-- Do the same for tickets still assigned to users deleted before that change.
UPDATE "ticket"
SET "assignedToId" = NULL
WHERE "assignedToId" IN (SELECT "id" FROM "user" WHERE "deletedAt" IS NOT NULL);
