import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { PRESET_INDEX } from '@/presets/_generated/index'
import { PRESET_CATEGORIES } from '@/presets/types'
import { PRESETS_TITLE, presetsDescription } from '../seo'
import { promoPlan } from '@/app/sponsors/promos'
import PresetsIndexPage from './PresetsIndexPage'

describe('PresetsIndexPage', () => {
  it('lists every preset by category, in category order, linking its pre-rendered page', () => {
    render(<PresetsIndexPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Text pipeline presets' })).toBeTruthy()
    const headings = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)
    expect(headings).toEqual(PRESET_CATEGORIES.filter(c => PRESET_INDEX.some(r => r.category === c)))
    for (const r of PRESET_INDEX) {
      const section = screen.getByRole('heading', { level: 2, name: r.category }).closest('section')!
      expect(within(section).getByRole('link', { name: new RegExp(r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).getAttribute('href'))
        .toBe(`/presets/${r.slug}/`)
    }
  })

  it('shows the inline house promo after the first category, as the pre-render does', () => {
    const { container } = render(<PresetsIndexPage />)
    const promo = container.querySelector('aside[data-promo-slot="inline"]')!
    expect(promo.getAttribute('data-promo')).toBe(promoPlan({ kind: 'index' }).inline)
    expect(promo.previousElementSibling).toBe(container.querySelector('section'))
  })

  it('sets the title and description the pre-render writes', () => {
    render(<PresetsIndexPage />)
    expect(document.title).toBe(PRESETS_TITLE)
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(presetsDescription(PRESET_INDEX.length))
  })

  it('keeps its search title and description within what a result shows', () => {
    expect(PRESETS_TITLE.length).toBeLessThanOrEqual(60)
    const description = presetsDescription(PRESET_INDEX.length)
    expect(description.length).toBeGreaterThanOrEqual(80)
    expect(description.length).toBeLessThanOrEqual(160)
  })
})
