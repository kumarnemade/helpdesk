import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createReplySchema, polishReplySchema, type CreateReplyInput, type PolishReplyInput } from 'core'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createTicketReply, polishTicketReply, ticketRepliesQueryKey } from '@/lib/tickets'

// Form fields hold the raw input; submit receives the parsed (trimmed) values.
type ReplyValues = z.input<typeof createReplySchema>

const defaultValues: ReplyValues = { body: '' }

// Adds an agent reply to the ticket's thread as the signed-in user. On success
// the thread is refetched and the form cleared. "Polish" replaces the draft
// with an AI-improved version for the agent to review before sending.
export function ReplyForm({ ticketId }: { ticketId: number }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    setValue,
    getValues,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReplyValues, unknown, CreateReplyInput>({
    resolver: zodResolver(createReplySchema),
    defaultValues,
  })

  const mutation = useMutation({
    mutationFn: (input: CreateReplyInput) => createTicketReply(ticketId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ticketRepliesQueryKey(ticketId) }),
  })

  const polish = useMutation({
    mutationFn: (input: PolishReplyInput) => polishTicketReply(ticketId, input),
  })

  async function onPolish() {
    clearErrors('root')
    // Validate the draft like a submit would (empty / too long → field error).
    if (!(await trigger('body'))) return
    let polished: string
    try {
      polished = await polish.mutateAsync(polishReplySchema.parse(getValues()))
    } catch (err) {
      // 400, 404 and 503 (not configured) carry a message for the user.
      const status = isAxiosError(err) ? err.response?.status : undefined
      const message = isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined
      if ((status === 400 || status === 404 || status === 503) && message) {
        setError('root', { message })
      } else {
        setError('root', { message: 'Failed to polish the reply. Please try again.' })
      }
      return
    }
    setValue('body', polished, { shouldDirty: true, shouldValidate: true })
  }

  const isEmpty = !watch('body').trim()

  async function onSubmit(values: CreateReplyInput) {
    try {
      await mutation.mutateAsync(values)
    } catch (err) {
      // 400 (e.g. too long) and 404 (ticket gone) carry a message for the user.
      const status = isAxiosError(err) ? err.response?.status : undefined
      const message = isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined
      if ((status === 400 || status === 404) && message) {
        setError('root', { message })
      } else {
        setError('root', { message: 'Failed to send the reply. Please try again.' })
      }
      return
    }
    reset(defaultValues)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      {errors.root && (
        <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errors.root.message}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="reply-body">Reply</Label>
        <Textarea
          id="reply-body"
          placeholder="Write a reply…"
          className="min-h-28 font-serif text-base leading-7"
          aria-invalid={errors.body ? true : undefined}
          {...register('body')}
        />
        {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onPolish} disabled={isEmpty || polish.isPending || isSubmitting}>
          {polish.isPending ? 'Polishing…' : 'Polish'}
        </Button>
        <Button type="submit" disabled={isEmpty || isSubmitting || polish.isPending}>
          {isSubmitting ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </form>
  )
}
