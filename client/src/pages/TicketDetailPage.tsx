import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { ticketIdParamsSchema } from 'core'
import { AssigneeSelect } from '@/components/AssigneeSelect'
import { BackToTickets } from '@/components/BackToTickets'
import { CategorySelect } from '@/components/CategorySelect'
import { ReplyForm } from '@/components/ReplyForm'
import { ReplyThread } from '@/components/ReplyThread'
import { StatusSelect } from '@/components/StatusSelect'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchTicket, ticketQueryKey, type TicketDetail } from '@/lib/tickets'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

export function TicketDetailPage() {
  const params = useParams()
  // A non-numeric id can't match a ticket, so don't ask the server.
  const parsed = ticketIdParamsSchema.safeParse(params)
  const id = parsed.success ? parsed.data.id : undefined

  const { data: ticket, isPending, isError, error } = useQuery({
    queryKey: ticketQueryKey(id ?? 0),
    queryFn: ({ signal }) => fetchTicket(id!, signal),
    enabled: id !== undefined,
  })

  const notFound = id === undefined || (isError && isAxiosError(error) && error.response?.status === 404)

  return (
    <div className="space-y-6">
      <BackToTickets />
      {notFound ? (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Ticket not found</h1>
          <p className="text-sm text-muted-foreground">It may have been removed, or the link is wrong.</p>
        </div>
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          Failed to load the ticket. Please try again.
        </p>
      ) : isPending ? (
        <TicketDetailSkeleton />
      ) : (
        <TicketDetailView ticket={ticket} />
      )}
    </div>
  )
}

// Two columns on wide screens: the ticket on the left, the editable fields in a
// narrow sidebar on the right. On small screens the sidebar stacks below.
const COLUMNS = 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start'

function TicketDetailSkeleton() {
  return (
    <div className={COLUMNS}>
      <div className="space-y-6">
        <span className="sr-only">Loading ticket…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-56" />
    </div>
  )
}

function TicketDetailView({ ticket }: { ticket: TicketDetail }) {
  return (
    <div className={COLUMNS}>
      <div className="min-w-0 space-y-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Ticket #{ticket.id}</p>
          <h1 className="text-2xl font-[family-name:Arial,Helvetica,sans-serif] font-bold break-words">{ticket.subject}</h1>
          <p className="text-sm text-muted-foreground">Received {formatDateTime(ticket.createdAt)}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {ticket.senderName} <span className="font-normal text-muted-foreground">&lt;{ticket.senderEmail}&gt;</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Plain-text body; bodyHtml is untrusted and isn't sent to the client. */}
            <p className="text-sm font-[family-name:Arial,Helvetica,sans-serif] font-bold whitespace-pre-wrap break-words">{ticket.body}</p>
          </CardContent>
        </Card>

        <section aria-labelledby="replies-heading" className="space-y-4">
          <h2 id="replies-heading" className="text-lg font-semibold">
            Replies
          </h2>
          <ReplyThread ticketId={ticket.id} />
          <ReplyForm ticketId={ticket.id} />
        </section>
      </div>

      <aside aria-label="Ticket properties">
        <Card>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <Field label="Status">
                <StatusSelect ticketId={ticket.id} status={ticket.status} />
              </Field>
              <Field label="Category">
                <CategorySelect ticketId={ticket.id} category={ticket.category} />
              </Field>
              <Field label="Assigned to">
                <AssigneeSelect ticketId={ticket.id} assignedTo={ticket.assignedTo} />
              </Field>
            </dl>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}
