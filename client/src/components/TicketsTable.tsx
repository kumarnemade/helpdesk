import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  createColumnHelper,
  functionalUpdate,
  globalFilteringFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
  type SortingState,
} from '@tanstack/react-table'
import {
  ticketFiltersSchema,
  type ListTicketsQuery,
  type TicketCategoryFilter,
  type TicketFilters as TicketFiltersValue,
  type TicketSortField,
  type TicketStatus,
} from 'core'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TicketFilters } from '@/components/TicketFilters'
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

// Column filter URL params; they double as column ids. `search` is the
// table's global filter.
const FILTER_KEYS = ['status', 'category'] as const
const SEARCH_KEY = 'search'

const features = tableFeatures({ rowSortingFeature, columnFilteringFeature, globalFilteringFeature })
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

// Search and filters live in the URL (/tickets?search=refund&status=open) so
// filtered views can be bookmarked and linked to. Invalid values are ignored.
function filtersFromSearchParams(searchParams: URLSearchParams): TicketFiltersValue {
  const search = ticketFiltersSchema.shape.search.safeParse(searchParams.get(SEARCH_KEY) ?? undefined)
  const status = ticketFiltersSchema.shape.status.safeParse(searchParams.get('status') ?? undefined)
  const category = ticketFiltersSchema.shape.category.safeParse(searchParams.get('category') ?? undefined)
  return {
    search: search.success ? search.data : undefined,
    status: status.success ? status.data : undefined,
    category: category.success ? category.data : undefined,
  }
}

function toColumnFilters(filters: TicketFiltersValue): ColumnFiltersState {
  return FILTER_KEYS.flatMap((id) => (filters[id] ? [{ id, value: filters[id] }] : []))
}

// Sorting is single-column, always set, and done by the server, as is filtering.
function toListQuery(sorting: SortingState, filters: TicketFiltersValue): ListTicketsQuery {
  const [sort = DEFAULT_SORTING[0]!] = sorting
  return { ...filters, sortBy: sort.id as TicketSortField, sortOrder: sort.desc ? 'desc' : 'asc' }
}

export function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromSearchParams(searchParams)
  const columnFilters = toColumnFilters(filters)
  // The raw text (untrimmed) so the search box shows exactly what was typed.
  const globalFilter = searchParams.get(SEARCH_KEY) ?? ''
  const isFiltered = columnFilters.length > 0 || filters.search !== undefined
  const query = toListQuery(sorting, filters)

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
    state: { sorting, columnFilters, globalFilter },
    onSortingChange: setSorting,
    // Write filter changes back to the URL, keeping any other params.
    onColumnFiltersChange: (updater) => {
      const next = functionalUpdate(updater, columnFilters)
      setSearchParams((params) => {
        for (const key of FILTER_KEYS) params.delete(key)
        for (const { id, value } of next) if (value) params.set(id, String(value))
        return params
      })
    },
    // Replace rather than push, so Back doesn't step through each search.
    onGlobalFilterChange: (updater) => {
      const next = String(functionalUpdate(updater, globalFilter) ?? '')
      setSearchParams(
        (params) => {
          if (next) params.set(SEARCH_KEY, next)
          else params.delete(SEARCH_KEY)
          return params
        },
        { replace: true },
      )
    },
    manualSorting: true,
    manualFiltering: true,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
  })

  const statusColumn = table.getColumn('status')
  const categoryColumn = table.getColumn('category')

  return (
    <div className="space-y-4">
      <TicketFilters
        search={globalFilter}
        status={statusColumn?.getFilterValue() as TicketStatus | undefined}
        category={categoryColumn?.getFilterValue() as TicketCategoryFilter | undefined}
        onSearchChange={(value) => table.setGlobalFilter(value)}
        onStatusChange={(value) => statusColumn?.setFilterValue(value)}
        onCategoryChange={(value) => categoryColumn?.setFilterValue(value)}
        // One URL update: two setSearchParams calls in a row would overwrite
        // each other.
        onClear={() =>
          setSearchParams((params) => {
            for (const key of [...FILTER_KEYS, SEARCH_KEY]) params.delete(key)
            return params
          })
        }
      />
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
                  {isFiltered ? 'No tickets match these filters.' : 'No tickets yet.'}
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
    </div>
  )
}
