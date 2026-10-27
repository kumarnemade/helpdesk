import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BotIcon, ClockIcon, InboxIcon, PercentIcon, TicketIcon } from 'lucide-react'
import { cn } from 'cn'
import { TicketsPerDayChart } from '@/components/TicketsPerDayChart'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardQueryKey, fetchDashboardStats, formatDuration, type DashboardStats } from '@/lib/dashboard'

// `ai` stats are about work the AI agent did and use its colour.
type Stat = { label: string; icon: ReactNode; value: (stats: DashboardStats) => string; ai?: boolean }

const STATS: Stat[] = [
  { label: 'Total tickets', icon: <TicketIcon aria-hidden="true" />, value: (s) => s.totalTickets.toLocaleString() },
  { label: 'Open tickets', icon: <InboxIcon aria-hidden="true" />, value: (s) => s.openTickets.toLocaleString() },
  { label: 'Resolved by AI', icon: <BotIcon aria-hidden="true" />, value: (s) => s.aiResolvedTickets.toLocaleString(), ai: true },
  { label: 'AI resolution rate', icon: <PercentIcon aria-hidden="true" />, value: (s) => `${s.aiResolvedPercent}%`, ai: true },
  {
    label: 'Average resolution time',
    icon: <ClockIcon aria-hidden="true" />,
    // Nothing resolved yet.
    value: (s) => (s.averageResolutionSeconds === null ? '—' : formatDuration(s.averageResolutionSeconds)),
  },
]

// The home page: ticket overview numbers and a tickets-per-day chart for
// admins and agents.
// Refetched whenever the page is opened, so it reflects the latest tickets.
export function DashboardPage() {
  const { data: stats, isPending, isError } = useQuery({
    queryKey: dashboardQueryKey,
    queryFn: ({ signal }) => fetchDashboardStats(signal),
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      {isPending && <span className="sr-only">Loading dashboard…</span>}

      {isError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Failed to load the dashboard. Please try again.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* One panel split into cells by 1px gaps over the border colour: a row
              on wide screens, two columns on medium ones. */}
          <ul
            aria-label="Ticket stats"
            className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-5"
          >
            {STATS.map((stat) => (
              <li key={stat.label} className="space-y-3 bg-card p-5 sm:last:col-span-2 lg:last:col-span-1">
                <h2
                  className={cn(
                    'flex items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0',
                    stat.ai && '[&_svg]:text-ai',
                  )}
                >
                  {stat.icon}
                  {stat.label}
                </h2>
                {isPending ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <p className={cn('text-3xl font-semibold tracking-tight', stat.ai && 'text-ai')}>{stat.value(stats)}</p>
                )}
              </li>
            ))}
          </ul>
          <TicketsPerDayChart data={stats?.ticketsPerDay} />
        </div>
      )}
    </div>
  )
}
