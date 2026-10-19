import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  createdAt: string
}

const COLUMN_COUNT = 4

export function UsersPage() {
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadUsers() {
      try {
        const res = await fetch('/api/users', { signal: controller.signal })
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const data: { users: User[] } = await res.json()
        setUsers(data.users)
      } catch (err) {
        if (controller.signal.aborted) return
        console.error(err)
        setError('Failed to load users. Please try again.')
      }
    }

    loadUsers()
    return () => controller.abort()
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <p className="mt-2 text-sm text-muted-foreground">Everyone who can sign in to Helpdesk.</p>

      <div className="mt-6 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {error ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center text-destructive" role="alert">
                  {error}
                </TableCell>
              </TableRow>
            ) : users === null ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center text-muted-foreground">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="h-24 text-center text-muted-foreground">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="capitalize">
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
