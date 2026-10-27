import type { TicketStatus } from 'core'
import { cn } from 'cn'
import { TICKET_STATUS_LABELS, TICKET_STATUS_LAMP_CLASSES } from '@/lib/tickets'

// A status as a coloured lamp and its label. The lamp is decorative: the label
// carries the meaning, so nothing depends on colour alone.
export function StatusLamp({ status, className }: { status: TicketStatus; className?: string }) {
  return (
    <span data-slot="status-lamp" data-status={status} className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', TICKET_STATUS_LAMP_CLASSES[status])} />
      {TICKET_STATUS_LABELS[status]}
    </span>
  )
}
