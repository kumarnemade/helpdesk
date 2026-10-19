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
