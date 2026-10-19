import axios, { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/lib/users'
import { UsersPage } from '@/pages/UsersPage'
import { renderWithQueryClient } from '@/test/render'

const admin: User = {
  id: 'u1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
  createdAt: '2026-01-15T10:00:00.000Z',
}

const agent: User = {
  id: 'u2',
  name: 'Alan Agent',
  email: 'alan@example.com',
  role: 'agent',
  createdAt: '2026-02-20T10:00:00.000Z',
}

function apiError(status: number, error: string) {
  const response = { status, data: { error }, headers: {}, statusText: '', config: { headers: new AxiosHeaders() } }
  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, response as AxiosResponse)
}

async function openConfirmation() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Delete Alan Agent' }))
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete user?' })
  return { user, dialog }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DeleteUserDialog', () => {
  it('asks for confirmation naming the user, and cancel makes no request', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })
    const del = vi.spyOn(axios, 'delete')
    renderWithQueryClient(<UsersPage />)

    const { user, dialog } = await openConfirmation()
    expect(dialog).toHaveTextContent('Alan Agent (alan@example.com) will no longer be able to sign in')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(del).not.toHaveBeenCalled()
    expect(screen.getByRole('cell', { name: 'Alan Agent' })).toBeInTheDocument()
  })

  it('deletes the user, closes the modal and removes the row', async () => {
    const get = vi
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ data: { users: [admin, agent] } })
      .mockResolvedValue({ data: { users: [admin] } })
    const del = vi.spyOn(axios, 'delete').mockResolvedValue({ status: 204 })
    renderWithQueryClient(<UsersPage />)

    const { user, dialog } = await openConfirmation()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(del).toHaveBeenCalledWith('/api/users/u2')
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Alan Agent' })).not.toBeInTheDocument())
    expect(get).toHaveBeenCalledTimes(2)
  })

  it.each([
    [403, 'Admins cannot be deleted'],
    [404, 'User not found'],
  ])('shows the server message for a %i and keeps the modal open', async (status, message) => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })
    vi.spyOn(axios, 'delete').mockRejectedValue(apiError(status, message))
    renderWithQueryClient(<UsersPage />)

    const { user, dialog } = await openConfirmation()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('shows a generic alert when the server fails, cleared on reopen', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: { users: [admin, agent] } })
    vi.spyOn(axios, 'delete').mockRejectedValue(apiError(500, 'Internal Server Error'))
    renderWithQueryClient(<UsersPage />)

    const { user, dialog } = await openConfirmation()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Failed to delete user. Please try again.')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const reopened = (await openConfirmation()).dialog
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument()
  })
})
