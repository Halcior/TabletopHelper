import type { BattleSession } from '../domain/battle/types'
import { authorizeSharedMutation } from './sharedEventPolicy'
import type { SharedMembership } from './types'

let activeMembership: SharedMembership | null = null

export function setSharedRuntimeMembership(membership: SharedMembership | null): void {
  activeMembership = membership
}

export function getSharedRuntimeMembership(): SharedMembership | null {
  return activeMembership
}

export function assertSharedMutationAllowed(before: BattleSession, after: BattleSession): void {
  const decision = authorizeSharedMutation(before, after, activeMembership)
  if (!decision.allowed) throw new Error(decision.reason ?? 'This action is not allowed from your shared player seat.')
}
