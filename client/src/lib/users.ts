import axios from 'axios'
import type { CreateUserInput } from 'core'

export type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  createdAt: string
}

export const usersQueryKey = ['users'] as const

export async function fetchUsers(signal?: AbortSignal) {
  const { data } = await axios.get<{ users: User[] }>('/api/users', { signal })
  return data.users
}

export async function createUser(input: CreateUserInput) {
  const { data } = await axios.post<{ user: User }>('/api/users', input)
  return data.user
}

// Soft delete on the server; the user disappears from the list.
export async function deleteUser(id: string) {
  await axios.delete(`/api/users/${encodeURIComponent(id)}`)
}
