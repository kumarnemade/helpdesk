import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BotIcon, ClockIcon, InboxIcon, PercentIcon, TicketIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TicketsPerDayChart } from '@/components/TicketsPerDayChart'
import { Skeleton } from '@/components/ui/skeleton'
import { dashboardQueryKey, fetchDashboardStats, formatDuration, type DashboardStats } from '@/lib/dashboard'

type Stat = { label: string; icon: ReactNode; value: (stats: DashboardStats) => string }

const STATS: Stat[] = [
  { label: 'Total tickets', icon: <TicketIcon aria-hidden="true" />, value: (s) => s.totalTickets.toLocaleString() },
  { label: 'Open tickets', icon: <InboxIcon aria-hidden="true" />, value: (s) => s.openTickets.toLocaleString() },
  { label: 'Resolved by AI', icon: <BotIcon aria-hidden="true" />, value: (s) => s.aiResolvedTickets.toLocaleString() },
  { label: 'AI resolution rate', icon: <PercentIcon aria-hidden="true" />, value: (s) => `${s.aiResolvedPercent}%` },
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
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      {isPending && <span className="sr-only">Loading dashboard…</span>}

      {isError ? (
        <p role="alert" className="mt-6 text-sm text-destructive">
          Failed to load the dashboard. Please try again.
        </p>
      ) : (
        <div className="mt-6 space-y-6">
          <ul aria-label="Ticket stats" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {STATS.map((stat) => (
              <li key={stat.label}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground [&_svg]:size-4">
                      {stat.icon}
                      <h2>{stat.label}</h2>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isPending ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      <p className="text-3xl font-semibold">{stat.value(stats)}</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <TicketsPerDayChart data={stats?.ticketsPerDay} />
        </div>
      )}
    </div>
  )
}
