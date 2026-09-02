import type { BattleSession, ScoreCategory } from './types'

export type ScoringAuditEntry = {
  id: string
  timestamp: string
  round: number
  playerId: string
  category: ScoreCategory
  label: string
  points?: number
  setTo?: number
  corrected: boolean
}

type RulesetData = Record<string, unknown>

function dataOf(value: unknown): RulesetData | null {
  return value && typeof value === 'object' ? value as RulesetData : null
}

export function buildScoringAudit(session: BattleSession): ScoringAuditEntry[] {
  const entries: ScoringAuditEntry[] = []
  const groups = new Map<string, typeof session.state.events>()
  for (const event of session.state.events) groups.set(event.actionId, [...(groups.get(event.actionId) ?? []), event])
  let round = 1

  for (const event of session.state.events) {
    if (event.type === 'ROUND_STARTED') round = event.payload.round
    if (event.type === 'RULESET_EVENT' && event.payload.action === 'SECONDARY_COMPLETED') {
      const data = dataOf(event.payload.data)
      if (typeof data?.playerId !== 'string' || typeof data.pointsAwarded !== 'number') continue
      const card = typeof data.cardId === 'string' ? data.cardId.replaceAll('_', ' ').toLocaleLowerCase() : 'Secondary'
      entries.push({
        id: event.id, timestamp: event.timestamp, round: typeof data.round === 'number' ? data.round : round,
        playerId: data.playerId, category: 'secondary', label: card, points: data.pointsAwarded, corrected: false,
      })
      continue
    }
    if (event.type === 'RULESET_EVENT' && event.payload.action === 'PRIMARY_COMMITTED') {
      const data = dataOf(event.payload.data)
      const reviews = Array.isArray(data?.reviews) ? data.reviews : []
      for (const [reviewIndex, rawReview] of reviews.entries()) {
        const review = dataOf(rawReview)
        if (typeof review?.playerId !== 'string' || typeof review.roundPrimary !== 'number') continue
        let remaining = review.roundPrimary
        const conditions = [review.neutralObjective, review.twoObjectives, review.operationalPlan]
        for (const [conditionIndex, rawCondition] of conditions.entries()) {
          const condition = dataOf(rawCondition)
          if (!condition?.completed || typeof condition.vp !== 'number' || typeof condition.label !== 'string' || remaining <= 0) continue
          const points = Math.min(condition.vp, remaining)
          remaining -= points
          entries.push({
            id: `${event.id}-${reviewIndex}-${conditionIndex}`, timestamp: event.timestamp,
            round: typeof review.round === 'number' ? review.round : round, playerId: review.playerId,
            category: condition.label === 'Operational Plan' ? 'plan' : 'primary', label: condition.label,
            points, corrected: false,
          })
        }
      }
      continue
    }
    if (event.type === 'STATE_CORRECTED' && event.payload.correction.kind === 'SCORE') {
      const correction = event.payload.correction
      entries.push({
        id: event.id, timestamp: event.timestamp, round, playerId: correction.playerId,
        category: correction.category, label: event.payload.reason, setTo: correction.value, corrected: true,
      })
      continue
    }
    if (event.type === 'SCORE_ADJUSTED') {
      const action = groups.get(event.actionId) ?? []
      const explained = action.some((item) => item.type === 'RULESET_EVENT' && (
        item.payload.action === 'SECONDARY_COMPLETED' || item.payload.action === 'PRIMARY_COMMITTED'
      ))
      if (explained) continue
      entries.push({
        id: event.id, timestamp: event.timestamp, round, playerId: event.payload.playerId,
        category: event.payload.category, label: 'Score adjustment', points: event.payload.delta, corrected: false,
      })
    }
  }
  return entries
}
