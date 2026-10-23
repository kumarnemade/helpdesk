import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  createColumnHelper,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type SortingState,
} from '@tanstack/react-table'
import type { ListTicketsQuery, TicketSortField, TicketStatus } from 'core'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchTickets,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  ticketsListQueryKey,
  type Ticket,
} from '@/lib/tickets'

const SKELETON_ROW_COUNT = 3

const STATUS_BADGE_VARIANTS = {
  new: 'default',
  open: 'secondary',
  resolved: 'outline',
  closed: 'outline',
} as const satisfies Record<TicketStatus, string>

// Matches the server's default order: newest first.
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }]

const features = tableFeatures({ rowSortingFeature })
const columnHelper = createColumnHelper<typeof features, Ticket>()

// Column ids are the server's sort fields (TICKET_SORT_FIELDS).
const columns = columnHelper.columns([
  columnHelper.accessor('subject', {
    header: 'Subject',
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor('senderName', {
    header: 'From',
    cell: ({ row }) => (
      <>
        <div>{row.original.senderName}</div>
        <div className="text-xs text-muted-foreground">{row.original.senderEmail}</div>
      </>
    ),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: ({ getValue }) => (
      <Badge variant={STATUS_BADGE_VARIANTS[getValue()]}>{TICKET_STATUS_LABELS[getValue()]}</Badge>
    ),
  }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: ({ getValue }) => {
      const category = getValue()
      return category ? TICKET_CATEGORY_LABELS[category] : <span className="text-muted-foreground">—</span>
    },
  }),
  columnHelper.accessor('assignedTo', {
    header: 'Assigned to',
    cell: ({ getValue }) => getValue()?.name ?? <span className="text-muted-foreground">Unassigned</span>,
  }),
  columnHelper.accessor('createdAt', {
    header: 'Received',
    cell: ({ getValue }) => new Date(getValue()).toLocaleDateString(),
  }),
])

const SKELETON_WIDTHS = ['h-4 w-48', 'h-4 w-36', 'h-5 w-16 rounded-4xl', 'h-4 w-28', 'h-4 w-24', 'h-4 w-20']

// Sorting is single-column, always set, and done by the server.
function toListQuery(sorting: SortingState): ListTicketsQuery {
  const [sort = DEFAULT_SORTING[0]!] = sorting
  return { sortBy: sort.id as TicketSortField, sortOrder: sort.desc ? 'desc' : 'asc' }
}

export function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)
  const query = toListQuery(sorting)

  const { data: tickets, isPending, isError } = useQuery({
    queryKey: ticketsListQueryKey(query),
    queryFn: ({ signal }) => fetchTickets(query, signal),
    // Keep showing the current rows while a new sort order loads.
    placeholderData: keepPreviousData,
  })

  const table = useTable({
    features,
    columns,
    data: tickets ?? [],
    getRowId: (ticket) => String(ticket.id),
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      className="-ml-2.5"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <table.FlexRender header={header} />
                      <SortIcon className={sorted ? undefined : 'text-muted-foreground'} />
                    </Button>
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isError ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-destructive" role="alert">
                Failed to load tickets. Please try again.
              </TableCell>
            </TableRow>
          ) : isPending ? (
            Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => (
              <TableRow key={i}>
                {SKELETON_WIDTHS.map((width, j) => (
                  <TableCell key={j}>
                    {i === 0 && j === 0 && <span className="sr-only">Loading tickets…</span>}
                    <Skeleton className={width} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : tickets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                No tickets yet.
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cell.column.id === 'subject' ? 'max-w-xs truncate font-medium' : undefined}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
