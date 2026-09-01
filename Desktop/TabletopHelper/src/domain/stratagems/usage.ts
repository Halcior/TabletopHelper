import type {
  StandardUsageLimit,
  StratagemUsageState,
  TimingState,
  UsageLimit,
} from './types'

export function createEmptyTimingState(): TimingState {
  return {
    stratagemUsage: {},
    reactionWindows: {},
    activeReactionWindowId: null,
  }
}

export function usageKey(playerId: string, stratagemId: string): string {
  return `${encodeURIComponent(playerId)}::${encodeURIComponent(stratagemId)}`
}

export function createEmptyUsage(playerId: string, stratagemId: string): StratagemUsageState {
  return {
    playerId,
    stratagemId,
    usedThisTurn: 0,
    usedThisBattleRound: 0,
    usedThisPhase: 0,
    timesUsedBattle: 0,
  }
}

export function getUsage(
  timing: TimingState | undefined,
  playerId: string,
  stratagemId: string,
): StratagemUsageState {
  return timing?.stratagemUsage[usageKey(playerId, stratagemId)]
    ?? createEmptyUsage(playerId, stratagemId)
}

export function recordUsage(
  usage: Record<string, StratagemUsageState>,
  playerId: string,
  stratagemId: string,
  round: number,
  activePlayerId: string,
  phase: StratagemUsageState['lastUsedPhase'],
): Record<string, StratagemUsageState> {
  const key = usageKey(playerId, stratagemId)
  const current = usage[key] ?? createEmptyUsage(playerId, stratagemId)
  return {
    ...usage,
    [key]: {
      ...current,
      usedThisTurn: current.usedThisTurn + 1,
      usedThisBattleRound: current.usedThisBattleRound + 1,
      usedThisPhase: current.usedThisPhase + 1,
      timesUsedBattle: current.timesUsedBattle + 1,
      lastUsedRound: round,
      lastUsedTurn: activePlayerId,
      lastUsedPhase: phase,
    },
  }
}

function mapUsage(
  usage: Record<string, StratagemUsageState>,
  update: (entry: StratagemUsageState) => StratagemUsageState,
): Record<string, StratagemUsageState> {
  return Object.fromEntries(Object.entries(usage).map(([key, entry]) => [key, update(entry)]))
}

export function resetPhaseUsage(
  usage: Record<string, StratagemUsageState>,
): Record<string, StratagemUsageState> {
  return mapUsage(usage, (entry) => ({ ...entry, usedThisPhase: 0 }))
}

export function resetTurnUsage(
  usage: Record<string, StratagemUsageState>,
): Record<string, StratagemUsageState> {
  return mapUsage(usage, (entry) => ({ ...entry, usedThisTurn: 0, usedThisPhase: 0 }))
}

export function resetBattleRoundUsage(
  usage: Record<string, StratagemUsageState>,
): Record<string, StratagemUsageState> {
  return mapUsage(usage, (entry) => ({
    ...entry,
    usedThisBattleRound: 0,
    usedThisTurn: 0,
    usedThisPhase: 0,
  }))
}

export function standardUsageLimitReason(
  limit: StandardUsageLimit,
  usage: StratagemUsageState,
): string | undefined {
  switch (limit) {
    case 'ONCE_PER_PHASE':
      return usage.usedThisPhase > 0 ? 'Already used in this phase.' : undefined
    case 'ONCE_PER_TURN':
      return usage.usedThisTurn > 0 ? 'Already used in this turn.' : undefined
    case 'ONCE_PER_BATTLE_ROUND':
      return usage.usedThisBattleRound > 0 ? 'Already used in this battle round.' : undefined
    case 'ONCE_PER_BATTLE':
      return usage.timesUsedBattle > 0 ? 'Already used in this battle.' : undefined
  }
}

export function isStandardUsageLimit(limit: UsageLimit): limit is StandardUsageLimit {
  return typeof limit === 'string'
}
