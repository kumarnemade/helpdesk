import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusLamp } from './StatusLamp'

describe('StatusLamp', () => {
  it('shows the status label with a decorative lamp in the status colour', () => {
    render(<StatusLamp status="open" />)

    const lamp = screen.getByText('Open')
    expect(lamp).toHaveAttribute('data-status', 'open')
    expect(lamp.querySelector('[aria-hidden="true"]')).toHaveClass('bg-status-open')
  })

  it('uses the AI colour for tickets the AI is processing', () => {
    render(<StatusLamp status="processing" />)

    expect(screen.getByText('Processing').querySelector('[aria-hidden="true"]')).toHaveClass('bg-status-processing')
  })
})
