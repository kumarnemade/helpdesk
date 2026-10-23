import { TicketsTable } from '@/components/TicketsTable'

export function TicketsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Tickets</h1>
      <p className="mt-2 text-sm text-muted-foreground">Support requests received by email. Click a column heading to sort.</p>

      <div className="mt-6">
        <TicketsTable />
      </div>
    </div>
  )
}
