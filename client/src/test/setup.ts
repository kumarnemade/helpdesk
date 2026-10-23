import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom lacks the pointer-capture and scrolling APIs Radix Select calls when it
// opens, so stub them (no-ops are enough for tests).
Element.prototype.hasPointerCapture ??= () => false
Element.prototype.releasePointerCapture ??= () => {}
Element.prototype.scrollIntoView ??= () => {}

// Vitest globals are off, so Testing Library can't register its own cleanup.
afterEach(() => {
  cleanup()
})
