import { useMutation } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { summarizeTicket } from '@/lib/tickets'

type SummaryBlock = { type: 'list'; items: string[] } | { type: 'paragraph'; text: string }

// The model writes plain text, usually as "- " bullet lines: consecutive
// bullets become one list, other non-blank lines become paragraphs.
function toBlocks(summary: string): SummaryBlock[] {
  const blocks: SummaryBlock[] = []
  for (const raw of summary.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const last = blocks.at(-1)
    if (bullet) {
      if (last?.type === 'list') last.items.push(bullet[1]!)
      else blocks.push({ type: 'list', items: [bullet[1]!] })
    } else {
      blocks.push({ type: 'paragraph', text: line })
    }
  }
  return blocks
}

// "Summarize" asks the server for an AI summary of the ticket and its replies.
// Every click generates a new one (nothing is cached or saved), so it picks up
// replies added since the last summary.
export function TicketSummary({ ticketId }: { ticketId: number }) {
  const mutation = useMutation({
    mutationFn: () => summarizeTicket(ticketId),
  })

  // 400, 404 and 503 (not configured) carry a message for the user.
  const status = isAxiosError(mutation.error) ? mutation.error.response?.status : undefined
  const serverMessage = isAxiosError<{ error?: string }>(mutation.error) ? mutation.error.response?.data?.error : undefined
  const errorMessage =
    (status === 400 || status === 404 || status === 503) && serverMessage
      ? serverMessage
      : 'Failed to summarize the ticket. Please try again.'

  return (
    <section aria-label="Ticket summary" className="space-y-3">
      <Button type="button" variant="outline" className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <SparklesIcon data-icon="inline-start" className="text-ai" aria-hidden="true" />
        {mutation.isPending ? 'Summarizing…' : mutation.data ? 'Regenerate summary' : 'Summarize'}
      </Button>
      {mutation.isError && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
      {mutation.data && (
        <Card className="border-l-4 border-l-ai">
          <CardHeader>
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <SparklesIcon className="text-ai" aria-hidden="true" />
                Summary
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm break-words">
            {toBlocks(mutation.data).map((block, i) =>
              block.type === 'list' ? (
                <ul key={i} className="list-disc space-y-1 pl-5">
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
