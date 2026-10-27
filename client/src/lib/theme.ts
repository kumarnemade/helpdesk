import { useSyncExternalStore } from 'react'
import { z } from 'zod'

// The viewer's colour theme choice; "system" follows the OS setting. Saved in
// localStorage, which can be unavailable (private windows, blocked storage),
// so every access falls back to "system". public/theme-init.js applies the
// saved theme before the first paint with the same key.
export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_STORAGE_KEY = 'helpdesk-theme'

const themeSchema = z.enum(THEMES).catch('system')
const darkQuery = '(prefers-color-scheme: dark)'

function readTheme(): Theme {
  try {
    return themeSchema.parse(localStorage.getItem(THEME_STORAGE_KEY) ?? undefined)
  } catch {
    return 'system'
  }
}

function prefersDark() {
  return typeof window.matchMedia === 'function' && window.matchMedia(darkQuery).matches
}

// Puts the `.dark` class on <html> when the theme (or the OS, on "system") is dark.
export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

const listeners = new Set<() => void>()
let current: Theme = readTheme()

export function setTheme(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Not saved; the choice still applies until the page is reloaded.
  }
  applyTheme(theme)
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Keeps "system" in step when the OS switches between light and dark.
export function watchSystemTheme() {
  if (typeof window.matchMedia !== 'function') return () => {}
  const media = window.matchMedia(darkQuery)
  const onChange = () => {
    if (current === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function useTheme() {
  return useSyncExternalStore(subscribe, () => current)
}
