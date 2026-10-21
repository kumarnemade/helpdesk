-- CreateEnum
CREATE TYPE "ReplySender" AS ENUM ('customer', 'agent');

-- AlterEnum
-- Recreated rather than ADD VALUE: Postgres can't use a newly added enum value
-- (the 'new' default below) in the same transaction.
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
CREATE TYPE "TicketStatus" AS ENUM ('new', 'open', 'resolved', 'closed');
ALTER TABLE "ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ticket" ALTER COLUMN "status" TYPE "TicketStatus" USING ("status"::text::"TicketStatus");
DROP TYPE "TicketStatus_old";

-- DropForeignKey
ALTER TABLE "ticket_message" DROP CONSTRAINT "ticket_message_ticketId_fkey";

-- DropIndex
DROP INDEX "ticket_customerEmail_idx";

-- AlterTable
ALTER TABLE "ticket" DROP COLUMN "customerEmail",
DROP COLUMN "customerName",
ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "emailMessageId" TEXT,
ADD COLUMN     "senderEmail" TEXT NOT NULL,
ADD COLUMN     "senderName" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'new';

-- DropTable
DROP TABLE "ticket_message";

-- DropEnum
DROP TYPE "MessageDirection";

-- CreateTable
CREATE TABLE "reply" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "senderType" "ReplySender" NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderEmail" TEXT NOT NULL,
    "authorId" TEXT,
    "emailMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reply_emailMessageId_key" ON "reply"("emailMessageId");

-- CreateIndex
CREATE INDEX "reply_ticketId_idx" ON "reply"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_emailMessageId_key" ON "ticket"("emailMessageId");

-- CreateIndex
CREATE INDEX "ticket_senderEmail_idx" ON "ticket"("senderEmail");

-- CreateIndex
CREATE INDEX "ticket_assignedToId_idx" ON "ticket"("assignedToId");

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply" ADD CONSTRAINT "reply_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reply" ADD CONSTRAINT "reply_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

