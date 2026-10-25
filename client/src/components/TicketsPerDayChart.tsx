import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { DASHBOARD_CHART_DAYS } from 'core'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatChartDay, formatFullDay, type TicketsPerDay } from '@/lib/dashboard'

const chartConfig = {
  count: { label: 'Tickets', color: 'var(--primary)' },
} satisfies ChartConfig

// Bar chart of tickets received per day on the dashboard. `data` is undefined
// while the dashboard loads. The SVG is hidden from screen readers, which get
// the same numbers as a visually hidden table.
export function TicketsPerDayChart({ data }: { data: TicketsPerDay[] | undefined }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Tickets per day</h2>
        </CardTitle>
        <CardDescription>Last {DASHBOARD_CHART_DAYS} days</CardDescription>
      </CardHeader>
      <CardContent>
        {data ? (
          <>
            <ChartContainer config={chartConfig} className="h-64 w-full" aria-hidden="true">
              <BarChart data={data}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={formatChartDay}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent labelFormatter={(value) => formatFullDay(String(value))} />}
                />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
            <table className="sr-only">
              <caption>Tickets received per day, last {DASHBOARD_CHART_DAYS} days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Tickets</th>
                </tr>
              </thead>
              <tbody>
                {data.map((day) => (
                  <tr key={day.date}>
                    <th scope="row">{formatFullDay(day.date)}</th>
                    <td>{day.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </CardContent>
    </Card>
  )
}
