import axios from 'axios'
import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithQueryClient } from '@/test/render'
import { formatChartDay, formatDuration, formatFullDay, type DashboardStats } from '@/lib/dashboard'
import { DashboardPage } from './DashboardPage'

const stats: DashboardStats = {
  totalTickets: 1250,
  openTickets: 30,
  aiResolvedTickets: 214,
  aiResolvedPercent: 17.1,
  averageResolutionSeconds: 4.5 * 60 * 60,
  ticketsPerDay: [
    { date: '2026-10-23', count: 0 },
    { date: '2026-10-24', count: 11 },
    { date: '2026-10-25', count: 5 },
  ],
}

// The value shown on the card whose heading is `label`.
function statValue(label: string) {
  const card = screen.getByRole('heading', { name: label }).closest('li')!
  return within(card).getByText((_, element) => element?.tagName === 'P')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DashboardPage', () => {
  it('shows the Dashboard heading and requests the stats with an abort signal', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: stats })
    renderWithQueryClient(<DashboardPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    await screen.findByText('1,250')
    expect(get).toHaveBeenCalledWith('/api/dashboard', {
      params: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      signal: expect.any(AbortSignal),
    })
  })

  it('shows every stat once loaded', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: stats })
    renderWithQueryClient(<DashboardPage />)

    await screen.findByText('1,250')
    expect(statValue('Total tickets')).toHaveTextContent((1250).toLocaleString())
    expect(statValue('Open tickets')).toHaveTextContent('30')
    expect(statValue('Resolved by AI')).toHaveTextContent('214')
    expect(statValue('AI resolution rate')).toHaveTextContent('17.1%')
    expect(statValue('Average resolution time')).toHaveTextContent('4.5 hours')
    expect(screen.queryByText('Loading dashboard…')).not.toBeInTheDocument()
  })

  it('shows the tickets per day below the stats, as a table for screen readers', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ data: stats })
    renderWithQueryClient(<DashboardPage />)

    const table = await screen.findByRole('table', { name: 'Tickets received per day, last 30 days' })
    expect(screen.getByRole('heading', { name: 'Tickets per day' })).toBeInTheDocument()
    expect(screen.getByText('Last 30 days')).toBeInTheDocument()
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      `${formatFullDay('2026-10-23')}0`,
      `${formatFullDay('2026-10-24')}11`,
      `${formatFullDay('2026-10-25')}5`,
    ])
  })

  it('shows a dash for the average resolution time when nothing has been resolved', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: {
        totalTickets: 3,
        openTickets: 1,
        aiResolvedTickets: 0,
        aiResolvedPercent: 0,
        averageResolutionSeconds: null,
        ticketsPerDay: [],
      },
    })
    renderWithQueryClient(<DashboardPage />)

    await screen.findByText('0%')
    expect(statValue('Average resolution time')).toHaveTextContent('—')
  })

  it('shows skeletons with an accessible loading label while pending', () => {
    vi.spyOn(axios, 'get').mockReturnValue(new Promise(() => {}))
    const { container } = renderWithQueryClient(<DashboardPage />)

    expect(screen.getByText('Loading dashboard…')).toBeInTheDocument()
    // One per stat plus the chart.
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(6)
    expect(screen.getByRole('heading', { name: 'Total tickets' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Tickets per day' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows an error alert when the request fails', async () => {
    vi.spyOn(axios, 'get').mockRejectedValue(new Error('Request failed with status code 500'))
    renderWithQueryClient(<DashboardPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load the dashboard. Please try again.')
    expect(screen.queryByRole('list', { name: 'Ticket stats' })).not.toBeInTheDocument()
    expect(screen.queryByText('Loading dashboard…')).not.toBeInTheDocument()
  })
})

describe('chart day labels', () => {
  it('reads dates as local days, without a UTC shift', () => {
    expect(formatChartDay('2026-10-25')).toBe(
      new Date(2026, 9, 25).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    )
    expect(formatFullDay('2026-01-01')).toBe(
      new Date(2026, 0, 1).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    )
  })
})

describe('formatDuration', () => {
  it('uses the largest unit that fits, to one decimal place', () => {
    expect(formatDuration(45)).toBe('45 sec')
    expect(formatDuration(12.5 * 60)).toBe('12.5 min')
    expect(formatDuration(2 * 60 * 60)).toBe('2 hours')
    expect(formatDuration(4.25 * 60 * 60)).toBe('4.3 hours')
    expect(formatDuration(3.1 * 24 * 60 * 60)).toBe('3.1 days')
  })
})
