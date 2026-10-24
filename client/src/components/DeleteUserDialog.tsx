import { useState, type MouseEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { assigneesQueryKey, ticketsQueryKey } from '@/lib/tickets'
import { deleteUser, usersQueryKey, type User } from '@/lib/users'

function errorMessage(error: unknown) {
  // 403 (admin) and 404 (already deleted) carry a message meant for the user.
  if (isAxiosError<{ error?: string }>(error)) {
    const status = error.response?.status
    const message = error.response?.data?.error
    if ((status === 403 || status === 404) && message) return message
  }
  return 'Failed to delete user. Please try again.'
}

export function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => deleteUser(user.id),
    // The server also unassigns the user's tickets, so refresh the tickets and
    // the assignee dropdown along with the user list.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: usersQueryKey }),
        queryClient.invalidateQueries({ queryKey: ticketsQueryKey }),
        queryClient.invalidateQueries({ queryKey: assigneesQueryKey }),
      ])
      setOpen(false)
    },
  })

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    setOpen(next)
    if (!next) mutation.reset()
  }

  function handleConfirm(event: MouseEvent) {
    // AlertDialogAction closes the dialog on click; keep it open until the
    // request succeeds so errors can be shown.
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${user.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete user?</AlertDialogTitle>
          <AlertDialogDescription>
            {user.name} ({user.email}) will no longer be able to sign in and will be removed from the user list. Tickets assigned to them will be unassigned.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {mutation.isError && (
          <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage(mutation.error)}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm} disabled={mutation.isPending}>
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
