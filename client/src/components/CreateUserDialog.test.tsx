import axios, { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/users'
import { UsersPage } from '@/pages/UsersPage'
import { renderWithQueryClient } from '@/test/render'
import { CreateUserDialog } from './CreateUserDialog'

const existingUser: User = {
  id: 'u1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
  createdAt: '2026-01-15T10:00:00.000Z',
}

const newUser: User = {
  id: 'u2',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  role: 'agent',
  createdAt: '2026-03-01T10:00:00.000Z',
}

const VALID_PASSWORD = 'correct-horse-battery'

function apiError(status: number, error: string) {
  const response = { status, data: { error }, headers: {}, statusText: '', config: { headers: new AxiosHeaders() } }
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response as AxiosResponse)
}

async function openDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create user' }))
  const dialog = await screen.findByRole('dialog', { name: 'Create user' })
  return { user, dialog }
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  values: { name?: string; email?: string; password?: string },
) {
  if (values.name) await user.type(within(dialog).getByLabelText('Name'), values.name)
  if (values.email) await user.type(within(dialog).getByLabelText('Email'), values.email)
  if (values.password) await user.type(within(dialog).getByLabelText('Password'), values.password)
}

beforeEach(() => {
  vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [existingUser] } })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CreateUserDialog', () => {
  it('opens a modal with name, email and password fields', async () => {
    renderWithQueryClient(<CreateUserDialog />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const { dialog } = await openDialog()

    expect(within(dialog).getByLabelText('Name')).toHaveValue('')
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(within(dialog).getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('shows required-field errors and does not submit an empty form', async () => {
    const post = vi.spyOn(axios, 'post')
    renderWithQueryClient(<CreateUserDialog />)
    const { user, dialog } = await openDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(dialog).getByText('Password must be at least 12 characters')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a name under 3 characters and a password under 12 characters', async () => {
    const post = vi.spyOn(axios, 'post')
    renderWithQueryClient(<CreateUserDialog />)
    const { user, dialog } = await openDialog()

    await fillForm(user, dialog, { name: 'Al', email: 'al@example.com', password: 'elevenchars' })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(within(dialog).getByText('Password must be at least 12 characters')).toBeInTheDocument()
    expect(within(dialog).queryByText('Enter a valid email address')).not.toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()
  })

  it('creates the user, closes the modal and refreshes the user list', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [existingUser] } })
      .mockResolvedValue({ data: { users: [existingUser, newUser] } })
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { user: newUser } })
    renderWithQueryClient(<UsersPage />)
    await screen.findByText(existingUser.name)

    const { user, dialog } = await openDialog()
    await fillForm(user, dialog, { name: '  Grace Hopper  ', email: ` ${newUser.email} `, password: VALID_PASSWORD })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(post).toHaveBeenCalledWith('/api/users', {
      name: 'Grace Hopper',
      email: newUser.email,
      password: VALID_PASSWORD,
    })
    expect(await screen.findByText(newUser.name)).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('shows a duplicate-email error on the email field and keeps the modal open', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(apiError(409, 'A user with this email already exists'))
    renderWithQueryClient(<CreateUserDialog />)
    const { user, dialog } = await openDialog()

    await fillForm(user, dialog, { name: 'Ada Again', email: existingUser.email, password: VALID_PASSWORD })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByText('A user with this email already exists')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows a generic alert when the server fails', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(apiError(500, 'Internal Server Error'))
    renderWithQueryClient(<CreateUserDialog />)
    const { user, dialog } = await openDialog()

    await fillForm(user, dialog, { name: 'Grace Hopper', email: newUser.email, password: VALID_PASSWORD })
    await user.click(within(dialog).getByRole('button', { name: 'Create user' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Failed to create user. Please try again.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears the form when cancelled and reopened', async () => {
    renderWithQueryClient(<CreateUserDialog />)
    const { user, dialog } = await openDialog()
    await fillForm(user, dialog, { name: 'Draft Name' })

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Create user' }))
    const reopened = await screen.findByRole('dialog', { name: 'Create user' })
    expect(within(reopened).getByLabelText('Name')).toHaveValue('')
  })
})
