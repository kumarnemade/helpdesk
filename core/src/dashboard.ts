import { z } from "zod";

// Days covered by the dashboard's tickets-per-day chart, ending today.
export const DASHBOARD_CHART_DAYS = 30;

export const MAX_TIME_ZONE_LENGTH = 100;

// IANA names (e.g. "Asia/Kolkata") that this runtime's Intl understands.
function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

// Query string of GET /api/dashboard. `timeZone` sets where each day starts
// and ends for the tickets-per-day counts (the browser's own zone); UTC by
// default.
export const dashboardQuerySchema = z.object({
  timeZone: z
    .string()
    .trim()
    .max(MAX_TIME_ZONE_LENGTH, "Invalid time zone")
    .refine(isValidTimeZone, { error: "Invalid time zone" })
    .default("UTC"),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
