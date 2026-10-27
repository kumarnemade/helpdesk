import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set (see server/.env.example)");
}

// At most 5 connections here and 5 for pg-boss (queue.ts), so the app fits
// poolers with small limits, e.g. Supabase's free session pooler (15).
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 5 }),
});
