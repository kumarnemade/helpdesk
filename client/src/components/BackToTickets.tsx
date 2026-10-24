import { Link, useLocation } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TicketLinkState } from '@/lib/tickets'

// Returns to the list view the page was opened from (search, filters, page),
// or the plain list when the page was opened directly.
export function BackToTickets() {
  const state = useLocation().state as TicketLinkState | null
  return (
    <Button variant="ghost" size="sm" className="-ml-2.5" asChild>
      <Link to={`/tickets${state?.from ?? ''}`}>
        <ArrowLeft />
        Back to tickets
      </Link>
    </Button>
  )
}
