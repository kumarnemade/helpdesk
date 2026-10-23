import { TICKET_STATUSES, type TicketStatus } from 'core'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateTicketErrorMessage, useUpdateTicket } from '@/hooks/useUpdateTicket'
import { TICKET_STATUS_LABELS } from '@/lib/tickets'

type Props = {
  ticketId: number
  status: TicketStatus
}

export function StatusSelect({ ticketId, status }: Props) {
  const mutation = useUpdateTicket(ticketId)

  // Show the choice while it saves; on failure fall back to the saved status.
  const current = (mutation.isPending ? mutation.variables.status : undefined) ?? status

  return (
    <div className="space-y-1.5">
      <Select
        value={current}
        onValueChange={(value) => mutation.mutate({ status: value as TicketStatus })}
        disabled={mutation.isPending}
      >
        <SelectTrigger aria-label="Status" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TICKET_STATUSES.map((value) => (
            <SelectItem key={value} value={value}>
              {TICKET_STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {updateTicketErrorMessage(mutation.error, 'Failed to update the status. Please try again.')}
        </p>
      )}
    </div>
  )
}
