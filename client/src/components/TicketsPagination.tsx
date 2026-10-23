import { TICKET_PAGE_SIZES } from 'core'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Props = {
  // 0-based, as in TanStack Table's pagination state.
  pageIndex: number
  pageSize: number
  pageCount: number
  total: number
  canPreviousPage: boolean
  canNextPage: boolean
  onFirstPage: () => void
  onPreviousPage: () => void
  onNextPage: () => void
  onLastPage: () => void
  onPageSizeChange: (pageSize: number) => void
}

export function TicketsPagination({
  pageIndex,
  pageSize,
  pageCount,
  total,
  canPreviousPage,
  canNextPage,
  onFirstPage,
  onPreviousPage,
  onNextPage,
  onLastPage,
  onPageSizeChange,
}: Props) {
  const first = pageIndex * pageSize + 1
  const last = Math.min((pageIndex + 1) * pageSize, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        Showing {first}–{last} of {total} {total === 1 ? 'ticket' : 'tickets'}
      </p>

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Label htmlFor="tickets-page-size">Rows per page</Label>
          <Select value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))}>
            <SelectTrigger id="tickets-page-size" size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TICKET_PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={onFirstPage} disabled={!canPreviousPage} aria-label="Go to first page">
            <ChevronsLeft />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onPreviousPage} disabled={!canPreviousPage} aria-label="Go to previous page">
            <ChevronLeft />
          </Button>
          <span className="px-2 font-medium" aria-live="polite">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <Button variant="outline" size="icon-sm" onClick={onNextPage} disabled={!canNextPage} aria-label="Go to next page">
            <ChevronRight />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={onLastPage} disabled={!canNextPage} aria-label="Go to last page">
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
