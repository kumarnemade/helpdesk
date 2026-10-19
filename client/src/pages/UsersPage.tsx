import { CreateUserDialog } from '@/components/CreateUserDialog'
import { UsersTable } from '@/components/UsersTable'

export function UsersPage() {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="mt-2 text-sm text-muted-foreground">Everyone who can sign in to Helpdesk.</p>
        </div>
        <CreateUserDialog />
      </div>

      <div className="mt-6">
        <UsersTable />
      </div>
    </div>
  )
}
