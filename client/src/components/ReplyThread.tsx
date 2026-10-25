import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  fetchTicketReplies,
  REPLY_SENDER_BADGE_VARIANTS,
  REPLY_SENDER_LABELS,
  ticketRepliesQueryKey,
} from '@/lib/tickets'

// The ticket's replies below the opening email, oldest first: customer emails,
// agent replies and AI auto-resolution replies, each as plain text.
export function ReplyThread({ ticketId }: { ticketId: number }) {
  const { data: replies, isPending, isError } = useQuery({
    queryKey: ticketRepliesQueryKey(ticketId),
    queryFn: ({ signal }) => fetchTicketReplies(ticketId, signal),
  })

  if (isPending) {
    return (
      <div className="space-y-4">
        <span className="sr-only">Loading replies…</span>
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    )
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load replies. Please try again.
      </p>
    )
  }

  if (replies.length === 0) {
    return <p className="text-sm text-muted-foreground">No replies yet.</p>
  }

  return (
    <ol aria-label="Replies" className="space-y-4">
      {replies.map((reply) => (
        <li key={reply.id}>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span>
                  {reply.senderName}{' '}
                  <span className="font-normal text-muted-foreground">&lt;{reply.senderEmail}&gt;</span>
                </span>
                <Badge variant={REPLY_SENDER_BADGE_VARIANTS[reply.senderType]}>
                  {REPLY_SENDER_LABELS[reply.senderType]}
                </Badge>
              </CardTitle>
              <p className="text-sm text-muted-foreground">{new Date(reply.createdAt).toLocaleString()}</p>
            </CardHeader>
            <CardContent>
              {/* Plain-text body; bodyHtml is untrusted and isn't sent to the client. */}
              <p className="text-sm font-[family-name:Arial,Helvetica,sans-serif] font-bold whitespace-pre-wrap break-words">{reply.body}</p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  )
}
