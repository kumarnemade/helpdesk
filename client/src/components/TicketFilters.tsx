import { useEffect, useEffectEvent, useState } from 'react'
import {
  MAX_TICKET_SEARCH_LENGTH,
  TICKET_CATEGORY_FILTERS,
  TICKET_STATUSES,
  type TicketCategoryFilter,
  type TicketStatus,
} from 'core'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TICKET_CATEGORY_FILTER_LABELS, TICKET_STATUS_LABELS } from '@/lib/tickets'

// Radix Select can't use "" as an item value, so "all" stands for no filter.
const ALL = 'all'

// Wait for a pause in typing before searching, so each keystroke isn't a request.
export const SEARCH_DEBOUNCE_MS = 300

type Props = {
  search: string
  status: TicketStatus | undefined
  category: TicketCategoryFilter | undefined
  onSearchChange: (search: string) => void
  onStatusChange: (status: TicketStatus | undefined) => void
  onCategoryChange: (category: TicketCategoryFilter | undefined) => void
  onClear: () => void
}

export function TicketFilters({
  search,
  status,
  category,
  onSearchChange,
  onStatusChange,
  onCategoryChange,
  onClear,
}: Props) {
  // The input updates immediately; `search` (the URL value) follows after the
  // debounce. When `search` changes from outside (Clear filters, navigation),
  // reset the input to match.
  const [draft, setDraft] = useState(search)
  const [syncedSearch, setSyncedSearch] = useState(search)
  if (search !== syncedSearch) {
    setSyncedSearch(search)
    setDraft(search)
  }

  const commitSearch = useEffectEvent((value: string) => onSearchChange(value))
  useEffect(() => {
    if (draft === search) return
    const timeout = setTimeout(() => commitSearch(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timeout)
  }, [draft, search])

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="ticket-search">Search tickets</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ticket-search"
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={MAX_TICKET_SEARCH_LENGTH}
            placeholder="Subject, name or email"
            className="w-64 pl-8"
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-status-filter">Status</Label>
        <Select
          value={status ?? ALL}
          onValueChange={(value) => onStatusChange(value === ALL ? undefined : (value as TicketStatus))}
        >
          <SelectTrigger id="ticket-status-filter" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {TICKET_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="ticket-category-filter">Category</Label>
        <Select
          value={category ?? ALL}
          onValueChange={(value) => onCategoryChange(value === ALL ? undefined : (value as TicketCategoryFilter))}
        >
          <SelectTrigger id="ticket-category-filter" className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {TICKET_CATEGORY_FILTERS.map((value) => (
              <SelectItem key={value} value={value}>
                {TICKET_CATEGORY_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(search || status || category) && (
        <Button variant="ghost" onClick={onClear}>
          <X />
          Clear filters
        </Button>
      )}
    </div>
  )
}
