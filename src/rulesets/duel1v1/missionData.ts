import { forceDispositions, missionCards, missionMatchups } from '@alpaca-software/40kdc-data'

export type DuelForceDispositionId =
  | 'take-and-hold'
  | 'purge-the-foe'
  | 'disruption'
  | 'reconnaissance'
  | 'priority-assets'

export type DuelSecondaryMode = 'tactical' | 'fixed'

export type DuelScoringAward = {
  vp?: number
  vp_per?: number
  per_max?: number
  vp_max?: number
  mode?: DuelSecondaryMode
  exclusive_group?: string
  cumulative?: boolean
  trigger?: unknown
  when?: unknown
  per?: string
}

export type DuelMissionCard = {
  id: string
  name: string
  card_type?: 'primary' | 'secondary'
  text?: string
  awards?: DuelScoringAward[]
  actions?: unknown[]
  on_draw?: unknown
}

type MissionMatchup = {
  disposition: string
  opponent_disposition: string
  mission_id: string
}

type ForceDisposition = {
  id: string
  name: string
}

export const DUEL_FORCE_DISPOSITIONS: { id: DuelForceDispositionId; name: string }[] = [
  { id: 'take-and-hold', name: 'Take and Hold' },
  { id: 'purge-the-foe', name: 'Purge the Foe' },
  { id: 'disruption', name: 'Disruption' },
  { id: 'reconnaissance', name: 'Reconnaissance' },
  { id: 'priority-assets', name: 'Priority Assets' },
]

const cardCollection = (missionCards as unknown as { all: DuelMissionCard[] }).all
const matchupCollection = (missionMatchups as unknown as { all: MissionMatchup[] }).all
const dispositionCollection = (forceDispositions as unknown as { all: ForceDisposition[] }).all

export const DUEL_SECONDARY_CARDS = cardCollection.filter((card) => card.card_type === 'secondary')
export const DUEL_SECONDARY_BY_ID = Object.fromEntries(DUEL_SECONDARY_CARDS.map((card) => [card.id, card]))

export const DUEL_FIXED_SECONDARY_CARDS = DUEL_SECONDARY_CARDS.filter((card) => (
  (card.awards ?? []).some((award) => award.mode === 'fixed')
))

export function getDuelPrimaryMissionCard(
  ownDisposition: DuelForceDispositionId,
  opponentDisposition: DuelForceDispositionId,
): DuelMissionCard | undefined {
  const matchup = matchupCollection.find((candidate) => (
    candidate.disposition === ownDisposition
    && candidate.opponent_disposition === opponentDisposition
  ))
  return matchup ? cardCollection.find((card) => card.id === matchup.mission_id) : undefined
}

export function getForceDispositionName(id: DuelForceDispositionId): string {
  return dispositionCollection.find((entry) => entry.id === id)?.name
    ?? DUEL_FORCE_DISPOSITIONS.find((entry) => entry.id === id)?.name
    ?? id
}

export function awardsForMode(card: DuelMissionCard, mode: DuelSecondaryMode): DuelScoringAward[] {
  return (card.awards ?? []).filter((award) => award.mode == null || award.mode === mode)
}

export type DuelAwardSelection = { index: number; count?: number }

function awardValue(award: DuelScoringAward, count = 1): number {
  if (award.vp != null) return Math.max(0, award.vp)
  if (award.vp_per != null) {
    const normalized = Math.max(0, Math.floor(count))
    const capped = award.per_max == null ? normalized : Math.min(normalized, award.per_max)
    return Math.max(0, award.vp_per * capped)
  }
  return 0
}

export function scoreDuelMissionCard(
  card: DuelMissionCard,
  mode: DuelSecondaryMode,
  selections: DuelAwardSelection[],
): number {
  const awards = awardsForMode(card, mode)
  const exclusive = new Map<string, number>()
  let total = 0
  for (const selection of selections) {
    const award = awards[selection.index]
    if (!award) continue
    const value = awardValue(award, selection.count ?? 1)
    if (award.exclusive_group) {
      exclusive.set(award.exclusive_group, Math.max(exclusive.get(award.exclusive_group) ?? 0, value))
    } else {
      total += value
    }
  }
  for (const value of exclusive.values()) total += value
  if (mode === 'tactical') return Math.min(5, total)
  return Math.max(0, total)
}

export function humanizeAward(award: DuelScoringAward): string {
  const amount = award.vp != null
    ? `${award.vp} VP`
    : award.vp_per != null
      ? `${award.vp_per} VP each${award.per_max ? ` (max ${award.per_max})` : ''}`
      : 'VP'
  const condition = award.when && typeof award.when === 'object'
    ? JSON.stringify(award.when).replaceAll('"', '').replaceAll('_', ' ')
    : award.per?.replaceAll('-', ' ')
  return condition ? `${amount} · ${condition}` : amount
}
