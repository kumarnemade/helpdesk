import axios from 'axios'
import type { DashboardQuery } from 'core'

// Tickets received on one day ("YYYY-MM-DD" in the browser's time zone).
export type TicketsPerDay = { date: string; count: number }

// GET /api/dashboard: ticket overview numbers. averageResolutionSeconds is
// null until a ticket has been resolved or closed; ticketsPerDay covers the
// last DASHBOARD_CHART_DAYS days, oldest first.
export type DashboardStats = {
  totalTickets: number
  openTickets: number
  aiResolvedTickets: number
  aiResolvedPercent: number
  averageResolutionSeconds: number | null
  ticketsPerDay: TicketsPerDay[]
}

export const dashboardQueryKey = ['dashboard'] as const

// Days in the chart start and end in the browser's time zone.
export async function fetchDashboardStats(signal?: AbortSignal) {
  const params: DashboardQuery = { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }
  const { data } = await axios.get<DashboardStats>('/api/dashboard', { params, signal })
  return data
}

// "YYYY-MM-DD" as a local date, so it isn't shifted by the UTC offset.
function parseDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(year!, month! - 1, day)
}

// Short axis label, e.g. "Oct 25".
export function formatChartDay(date: string) {
  return parseDay(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Full label for the tooltip and table, e.g. "Sat, Oct 25, 2026".
export function formatFullDay(date: string) {
  return parseDay(date).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// A duration in the largest unit that fits, to one decimal place: "45 sec",
// "12.5 min", "4.2 hours", "3.1 days".
export function formatDuration(seconds: number) {
  const format = (value: number, unit: string) => `${Number(value.toFixed(1))} ${unit}`
  if (seconds < MINUTE) return format(seconds, 'sec')
  if (seconds < HOUR) return format(seconds / MINUTE, 'min')
  if (seconds < DAY) return format(seconds / HOUR, 'hours')
  return format(seconds / DAY, 'days')
}
