import { useQuery } from '@tanstack/react-query'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { updateTicketErrorMessage, useUpdateTicket } from '@/hooks/useUpdateTicket'
import { assigneesQueryKey, fetchAssignees, type Assignee } from '@/lib/tickets'

// Radix Select can't use "" or null as an item value.
const UNASSIGNED = 'unassigned'

type Props = {
  ticketId: number
  assignedTo: Assignee | null
}

export function AssigneeSelect({ ticketId, assignedTo }: Props) {
  const assignees = useQuery({
    queryKey: assigneesQueryKey,
    queryFn: ({ signal }) => fetchAssignees(signal),
  })

  const mutation = useUpdateTicket(ticketId)

  // Show the choice while it saves; on failure fall back to the saved assignee.
  const currentId = mutation.isPending ? mutation.variables.assignedToId : (assignedTo?.id ?? null)

  // Keep the saved assignee as an item even if they're not listed (deleted
  // since, or the AI agent, which only auto-resolution assigns), so the
  // trigger can still show their name; it's disabled as the server won't
  // accept them.
  const options = assignees.data ?? []
  const missingCurrent = assignedTo && !options.some((user) => user.id === assignedTo.id) ? assignedTo : null

  return (
    <div className="space-y-1.5">
      <Select
        value={currentId ?? UNASSIGNED}
        onValueChange={(value) => mutation.mutate({ assignedToId: value === UNASSIGNED ? null : value })}
        disabled={mutation.isPending}
      >
        <SelectTrigger aria-label="Assigned to" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
          {missingCurrent && (
            <SelectItem value={missingCurrent.id} disabled>
              {missingCurrent.name}
            </SelectItem>
          )}
          {options.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {mutation.isError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          {updateTicketErrorMessage(mutation.error, 'Failed to update the assignee. Please try again.')}
        </p>
      )}
      {assignees.isError && (
        <p role="alert" className="text-sm font-normal text-destructive">
          Couldn't load the list of assignees.
        </p>
      )}
    </div>
  )
}
