import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const theme = readFileSync(new URL('./tacticalTheme.css', import.meta.url), 'utf8')
const entry = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8')
const icon = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')

describe('tactical visual system contract', () => {
  it('loads the canonical theme after the feature styles', () => {
    expect(entry.indexOf("./tacticalTheme.css")).toBeGreaterThan(entry.indexOf("./reactionHold.css"))
  })

  it('defines distinct semantic player and battle-state colours', () => {
    expect(theme).toContain('--player-0:')
    expect(theme).toContain('--player-1:')
    expect(theme).toContain('--player-2:')
    expect(theme).toContain('--danger-bright:')
    expect(theme).toContain('--success-bright:')
    expect(theme).toMatch(/\.score-card--player-0\s*{[^}]*--player-color:\s*var\(--player-0\)/s)
  })

  it('keeps the mobile command surface touch sized and readable', () => {
    const mobile = theme.slice(theme.indexOf('@media (max-width: 820px)'))
    expect(mobile).toMatch(/\.next-phase\s*{[^}]*min-height:\s*46px/s)
    expect(mobile).toMatch(/\.battle-tabs button\s*{[^}]*min-height:\s*48px/s)
    expect(mobile).not.toMatch(/font-size:\s*\.(?:[0-6](?:\d)?|7[0-4])rem/)
  })

  it('provides reduced-motion handling and a three-player app mark', () => {
    expect(theme).toContain('@media (prefers-reduced-motion: reduce)')
    expect(icon).toContain('#d3ad56')
    expect(icon).toContain('#67a8d5')
    expect(icon).toContain('#ce716a')
  })
})
