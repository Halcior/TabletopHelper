import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./mobileBattle.css', import.meta.url), 'utf8')
const PHONE_VIEWPORTS = [360, 390, 412]

describe('mobile battle CSS contract', () => {
  it.each(PHONE_VIEWPORTS)('keeps the %ipx phone inside the compact breakpoints', (width) => {
    expect(width).toBeLessThanOrEqual(430)
    expect(css).toContain('@media (max-width: 820px)')
    expect(css).toContain('@media (max-width: 430px)')
  })

  it('keeps controls touch sized and the primary footer single-column', () => {
    expect(css).toMatch(/\.battle-page button\s*{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.battle-actions\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
  })

  it('shows objective ownership without horizontal scrolling', () => {
    expect(css).toMatch(/\.quick-objective-list\s*{[^}]*grid-template-columns:\s*repeat\(3,/s)
    expect(css).not.toMatch(/\.quick-objective-list span\s*{[^}]*display:\s*none/s)
  })

  it('does not define sub-12px text in the final mobile override', () => {
    expect(css).not.toMatch(/font-size:\s*\.(?:[0-6](?:\d)?|7[0-4])rem/)
  })
})
