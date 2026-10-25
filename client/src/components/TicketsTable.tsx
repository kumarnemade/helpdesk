import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  columnFilteringFeature,
  createColumnHelper,
  functionalUpdate,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table'
import {
  DEFAULT_TICKET_PAGE_SIZE,
  listTicketsQuerySchema,
  ticketFiltersSchema,
  type ListTicketsQuery,
  type TicketCategoryFilter,
  type TicketFilters as TicketFiltersValue,
  type TicketSortField,
  type AgentTicketStatus,
} from 'core'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { TicketFilters } from '@/components/TicketFilters'
import { TicketsPagination } from '@/components/TicketsPagination'
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
  TICKET_STATUS_BADGE_VARIANTS,
  TICKET_STATUS_LABELS,
  ticketsListQueryKey,
  type Ticket,
  type TicketLinkState,
} from '@/lib/tickets'

const SKELETON_ROW_COUNT = 3

// Matches the server's default order: newest first.
const DEFAULT_SORTING: SortingState = [{ id: 'createdAt', desc: true }]

// Column filter URL params; they double as column ids. `search` is the
// table's global filter.
const FILTER_KEYS = ['status', 'category'] as const
const SEARCH_KEY = 'search'
// Pagination URL params; `page` is 1-based (TanStack's pageIndex is 0-based).
const PAGE_KEY = 'page'
const PAGE_SIZE_KEY = 'pageSize'

// Passes the list's query string (search, filters, page) along so the detail
// page's back link returns to the same view.
function SubjectLink({ ticket }: { ticket: Ticket }) {
  const { search } = useLocation()
  return (
    <Link to={`/tickets/${ticket.id}`} state={{ from: search } satisfies TicketLinkState} className="hover:underline">
      {ticket.subject}
    </Link>
  )
}

const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
})
const columnHelper = createColumnHelper<typeof features, Ticket>()

// Column ids are the server's sort fields (TICKET_SORT_FIELDS).
const columns = columnHelper.columns([
  columnHelper.accessor('subject', {
    header: 'Subject',
    cell: ({ row }) => <SubjectLink ticket={row.original} />,
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
      <Badge variant={TICKET_STATUS_BADGE_VARIANTS[getValue()]}>{TICKET_STATUS_LABELS[getValue()]}</Badge>
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

// Page 1 and the default page size are left out of the URL; invalid values
// fall back to them.
function paginationFromSearchParams(searchParams: URLSearchParams): PaginationState {
  const page = listTicketsQuerySchema.shape.page.safeParse(searchParams.get(PAGE_KEY) ?? undefined)
  const pageSize = listTicketsQuerySchema.shape.pageSize.safeParse(searchParams.get(PAGE_SIZE_KEY) ?? undefined)
  return {
    pageIndex: page.success ? page.data - 1 : 0,
    pageSize: pageSize.success ? pageSize.data : DEFAULT_TICKET_PAGE_SIZE,
  }
}

function writePagination(params: URLSearchParams, { pageIndex, pageSize }: PaginationState) {
  if (pageIndex > 0) params.set(PAGE_KEY, String(pageIndex + 1))
  else params.delete(PAGE_KEY)
  if (pageSize !== DEFAULT_TICKET_PAGE_SIZE) params.set(PAGE_SIZE_KEY, String(pageSize))
  else params.delete(PAGE_SIZE_KEY)
}

// Sorting is single-column, always set, and done by the server, as are
// filtering and pagination.
function toListQuery(sorting: SortingState, filters: TicketFiltersValue, pagination: PaginationState): ListTicketsQuery {
  const [sort = DEFAULT_SORTING[0]!] = sorting
  return {
    ...filters,
    sortBy: sort.id as TicketSortField,
    sortOrder: sort.desc ? 'desc' : 'asc',
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
  }
}

export function TicketsTable() {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING)
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromSearchParams(searchParams)
  const columnFilters = toColumnFilters(filters)
  // The raw text (untrimmed) so the search box shows exactly what was typed.
  const globalFilter = searchParams.get(SEARCH_KEY) ?? ''
  const pagination = paginationFromSearchParams(searchParams)
  const isFiltered = columnFilters.length > 0 || filters.search !== undefined
  const query = toListQuery(sorting, filters, pagination)

  const { data, isPending, isError } = useQuery({
    queryKey: ticketsListQueryKey(query),
    queryFn: ({ signal }) => fetchTickets(query, signal),
    // Keep showing the current rows while another page, filter or sort loads.
    placeholderData: keepPreviousData,
  })
  const tickets = data?.tickets
  const total = data?.total ?? 0

  const table = useTable({
    features,
    columns,
    data: tickets ?? [],
    getRowId: (ticket) => String(ticket.id),
    rowCount: total,
    state: { sorting, columnFilters, globalFilter, pagination },
    // Changing the sort, filters or search goes back to page 1 (in the same
    // URL update, as consecutive setSearchParams calls overwrite each other).
    onSortingChange: (updater) => {
      setSorting(updater)
      setSearchParams((params) => {
        params.delete(PAGE_KEY)
        return params
      })
    },
    // Write filter changes back to the URL, keeping any other params.
    onColumnFiltersChange: (updater) => {
      const next = functionalUpdate(updater, columnFilters)
      setSearchParams((params) => {
        for (const key of FILTER_KEYS) params.delete(key)
        for (const { id, value } of next) if (value) params.set(id, String(value))
        params.delete(PAGE_KEY)
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
          params.delete(PAGE_KEY)
          return params
        },
        { replace: true },
      )
    },
    onPaginationChange: (updater) => {
      const next = functionalUpdate(updater, pagination)
      setSearchParams((params) => {
        writePagination(params, next)
        return params
      })
    },
    manualSorting: true,
    manualFiltering: true,
    manualPagination: true,
    // Resets are done explicitly above, in the URL.
    autoResetPageIndex: false,
    enableMultiSort: false,
    enableSortingRemoval: false,
    sortDescFirst: false,
  })

  const statusColumn = table.getColumn('status')
  const categoryColumn = table.getColumn('category')
  const pageCount = table.getPageCount()

  // A page past the end (e.g. ?page=9 after the list shrank) comes back empty
  // with the real total: move to the last page that has tickets.
  const isPastLastPage = data !== undefined && total > 0 && pagination.pageIndex >= pageCount
  const { pageSize } = pagination
  useEffect(() => {
    if (isPastLastPage) {
      setSearchParams(
        (params) => {
          writePagination(params, { pageIndex: pageCount - 1, pageSize })
          return params
        },
        { replace: true },
      )
    }
  }, [isPastLastPage, pageCount, pageSize, setSearchParams])

  return (
    <div className="space-y-4">
      <TicketFilters
        search={globalFilter}
        status={statusColumn?.getFilterValue() as AgentTicketStatus | undefined}
        category={categoryColumn?.getFilterValue() as TicketCategoryFilter | undefined}
        onSearchChange={(value) => table.setGlobalFilter(value)}
        onStatusChange={(value) => statusColumn?.setFilterValue(value)}
        onCategoryChange={(value) => categoryColumn?.setFilterValue(value)}
        // One URL update: two setSearchParams calls in a row would overwrite
        // each other.
        onClear={() =>
          setSearchParams((params) => {
            for (const key of [...FILTER_KEYS, SEARCH_KEY, PAGE_KEY]) params.delete(key)
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
            ) : tickets === undefined || tickets.length === 0 ? (
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
                      className={cell.column.id === 'subject' ? 'max-w-xs truncate font-[family-name:Arial,Helvetica,sans-serif] font-bold' : undefined}
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
      {!isError && total > 0 && !isPastLastPage && (
        <TicketsPagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          pageCount={pageCount}
          total={total}
          canPreviousPage={table.getCanPreviousPage()}
          canNextPage={table.getCanNextPage()}
          onFirstPage={() => table.firstPage()}
          onPreviousPage={() => table.previousPage()}
          onNextPage={() => table.nextPage()}
          onLastPage={() => table.lastPage()}
          // A new page size starts again at page 1.
          onPageSizeChange={(pageSize) => table.setPagination({ pageIndex: 0, pageSize })}
        />
      )}
    </div>
  )
}
