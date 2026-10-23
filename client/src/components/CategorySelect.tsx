import { TICKET_CATEGORIES, type TicketCategory } from 'core'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateTicketErrorMessage, useUpdateTicket } from '@/hooks/useUpdateTicket'
import { TICKET_CATEGORY_LABELS } from '@/lib/tickets'

// Radix Select can't use "" or null as an item value.
const UNCATEGORISED = 'none'

type Props = {
  ticketId: number
  category: TicketCategory | null
}

export function CategorySelect({ ticketId, category }: Props) {
  const mutation = useUpdateTicket(ticketId)

  // Show the choice while it saves; on failure fall back to the saved category.
  const current = mutation.isPending ? mutation.variables.category : category

  return (
    <div className="space-y-1.5">
      <Select
        value={current ?? UNCATEGORISED}
        onValueChange={(value) =>
          mutation.mutate({ category: value === UNCATEGORISED ? null : (value as TicketCategory) })
        }
        disabled={mutation.isPending}
      >
        <SelectTrigger aria-label="Category" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNCATEGORISED}>Uncategorised</SelectItem>
          {TICKET_CATEGORIES.map((value) => (
            <SelectItem key={value} value={value}>
              {TICKET_CATEGORY_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {updateTicketErrorMessage(mutation.error, 'Failed to update the category. Please try again.')}
        </p>
      )}
    </div>
  )
}
