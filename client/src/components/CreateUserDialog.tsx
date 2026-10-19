import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { createUserSchema, MIN_PASSWORD_LENGTH, type CreateUserInput } from 'core'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createUser, usersQueryKey } from '@/lib/users'

// Form fields hold the raw input; submit receives the parsed (trimmed, lowercased) values.
type CreateUserValues = z.input<typeof createUserSchema>

const defaultValues: CreateUserValues = { name: '', email: '', password: '' }

export function CreateUserDialog() {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserValues, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues,
  })

  const mutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usersQueryKey }),
  })

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) reset(defaultValues)
  }

  async function onSubmit(values: CreateUserInput) {
    try {
      await mutation.mutateAsync(values)
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined
      const message = isAxiosError<{ error?: string }>(err) ? err.response?.data?.error : undefined
      if (status === 409) {
        setError('email', { message: message ?? 'A user with this email already exists' })
      } else if (status === 400 && message) {
        setError('root', { message })
      } else {
        setError('root', { message: 'Failed to create user. Please try again.' })
      }
      return
    }
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>Create user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user</DialogTitle>
          <DialogDescription>New users are agents and can sign in right away.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {errors.root && (
            <div role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {errors.root.message}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="create-user-name">Name</Label>
            <Input
              id="create-user-name"
              placeholder="Jane Doe"
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              {...register('name')}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-email">Email</Label>
            <Input
              id="create-user-email"
              placeholder="jane@example.com"
              type="email"
              autoComplete="off"
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-password">Password</Label>
            <Input
              id="create-user-password"
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
