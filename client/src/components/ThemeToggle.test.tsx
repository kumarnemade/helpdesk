import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { setTheme, THEME_STORAGE_KEY } from '@/lib/theme'
import { ThemeToggle } from './ThemeToggle'

async function choose(name: string) {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Theme' }))
  await user.click(await screen.findByRole('menuitemradio', { name }))
}

afterEach(() => {
  setTheme('system')
  localStorage.clear()
})

describe('ThemeToggle', () => {
  it('offers light, dark and match system, with the current choice checked', async () => {
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Theme' }))

    expect(await screen.findByRole('menuitemradio', { name: 'Light' })).not.toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).not.toBeChecked()
    expect(screen.getByRole('menuitemradio', { name: 'Match system' })).toBeChecked()
  })

  it('switches to dark, saves the choice and switches back to light', async () => {
    render(<ThemeToggle />)

    await choose('Dark')
    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await choose('Light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
