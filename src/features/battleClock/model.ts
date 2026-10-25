import type { BattleSession, BattleSetup } from '../../domain/battle/types'

export type ClockPreset = 'off' | 'casual' | 'competitive' | 'custom'
export type ClockConfig = { preset: ClockPreset; limitMs: number }
export type ClockBudget = {
  id: string
  name: string
  playerIds: string[]
  usedMs: number
  rounds: Record<string, number>
  manualPasses: number
}
export type BattleClockState = {
  version: 1
  revision: number
  config: ClockConfig
  budgets: ClockBudget[]
  activeBudgetId: string
  turnBudgetId: string
  round: number
  running: boolean
  anchorAt: number
  startedAt: number | null
  endedAt: number | null
}
export type ClockCommand = { type: 'pass'; targetId: string } | { type: 'pause' | 'resume' }
export type ClockSnapshot = { config: ClockConfig; clock: BattleClockState | null; serverNow: number; applied: boolean }
export const OFF_CLOCK: ClockConfig = { preset: 'off', limitMs: 0 }

export function clockConfig(preset: ClockPreset, minutes = 90): ClockConfig {
  if (preset === 'off') return { ...OFF_CLOCK }
  const limitMs = (preset === 'casual' ? 120 : preset === 'competitive' ? 90 : minutes) * 60_000
  // A finite, positive custom budget, up to seven days. Sub-minute values are supported.
  if (!Number.isFinite(limitMs) || limitMs < 1000 || limitMs > 604_800_000) throw new Error('Limit czasu musi wynosić od 1 sekundy do 7 dni.')
  return { preset, limitMs: Math.round(limitMs) }
}

export function createBattleClock(setup: BattleSetup, config: ClockConfig, now: number): BattleClockState | undefined {
  if (config.preset === 'off') return undefined
  const groups = setup.doubles?.forces.map(force => ({ id: force.id, name: force.name, playerIds: [...force.memberPlayerIds] }))
    ?? setup.players.map(player => ({ id: player.id, name: player.name, playerIds: [player.id] }))
  const budgets = groups.map(group => ({ ...group, usedMs: 0, rounds: {}, manualPasses: 0 }))
  const activeBudgetId = budgets.find(b => b.playerIds.includes(setup.turnOrder[0]))!.id
  return { version: 1, revision: 0, config, budgets, activeBudgetId, turnBudgetId: activeBudgetId,
    round: 1, running: false, anchorAt: now, startedAt: null, endedAt: null }
}

/** Projection only. No timer writes: one elapsed interval belongs to exactly one budget and round. */
export function projectClock(clock: BattleClockState, now: number): BattleClockState {
  const elapsed = clock.running && clock.endedAt === null ? Math.max(0, now - clock.anchorAt) : 0
  return { ...clock, anchorAt: Math.max(now, clock.anchorAt), budgets: clock.budgets.map(budget => budget.id === clock.activeBudgetId && elapsed > 0
    ? { ...budget, usedMs: budget.usedMs + elapsed, rounds: { ...budget.rounds, [clock.round]: (budget.rounds[clock.round] ?? 0) + elapsed } } : budget) }
}

export function commandClock(clock: BattleClockState, command: ClockCommand, now: number): BattleClockState {
  if (clock.endedAt !== null) return clock
  if (command.type === 'pass' && (command.targetId === clock.activeBudgetId || !clock.budgets.some(b => b.id === command.targetId))) return clock
  if (command.type === 'pause' && !clock.running || command.type === 'resume' && clock.running) return clock
  const next = projectClock(clock, now)
  if (command.type === 'pass') {
    next.budgets = next.budgets.map(b => b.id === next.activeBudgetId ? { ...b, manualPasses: b.manualPasses + 1 } : b)
    next.activeBudgetId = command.targetId
  } else {
    next.running = command.type === 'resume'
    if (next.running && next.startedAt === null) next.startedAt = now
  }
  return { ...next, revision: clock.revision + 1 }
}

/** Follow the existing turn engine; phase changes deliberately do nothing. Undo never refunds time. */
export function reconcileClock(clock: BattleClockState | undefined, session: BattleSession, now: number): BattleClockState | undefined {
  if (!clock) return undefined
  const target = clock.budgets.find(b => b.playerIds.includes(session.state.activePlayerId))?.id
  const ended = session.state.status !== 'active'
  if (target === clock.turnBudgetId && session.state.round === clock.round && ended === (clock.endedAt !== null)) return clock
  const next = projectClock(clock, now)
  return { ...next, revision: clock.revision + 1, round: session.state.round,
    turnBudgetId: target ?? next.turnBudgetId,
    activeBudgetId: target !== clock.turnBudgetId ? target ?? next.activeBudgetId : next.activeBudgetId,
    running: ended ? false : next.running,
    endedAt: ended ? next.endedAt ?? now : null }
}

/** Keep disabled shared games' frozen setup identical to historical snapshots. */
export function withClockSnapshot(session: BattleSession, snapshot: ClockSnapshot): BattleSession {
  const { battleClock: _old, ...setup } = session.setup
  return { ...session,
    setup: snapshot.config.preset === 'off' ? setup : { ...setup, battleClock: snapshot.config },
    battleClock: snapshot.clock ?? undefined }
}

export type ClockStatistics = ClockBudget & { remainingMs: number; overtimeMs: number }
export function timeStatistics(clock: BattleClockState | undefined, now = Date.now()): ClockStatistics[] {
  if (!clock) return []
  return projectClock(clock, now).budgets.map(b => ({ ...b, remainingMs: Math.max(0, clock.config.limitMs - b.usedMs), overtimeMs: Math.max(0, b.usedMs - clock.config.limitMs) }))
}
export function clockWarning(remainingMs: number): 'normal' | 'quarter' | 'five' | 'one' | 'expired' {
  return remainingMs <= 0 ? 'expired' : remainingMs <= 60_000 ? 'one' : remainingMs <= 300_000 ? 'five' : remainingMs <= 900_000 ? 'quarter' : 'normal'
}
export function formatClock(ms: number): string {
  const seconds = Math.ceil(Math.max(0, ms) / 1000)
  const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, '0')} s`
}
