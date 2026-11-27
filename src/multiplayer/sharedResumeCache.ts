import type { BattleEvent } from '../domain/battle/types'
import type { SharedMembership } from './types'

function keys(membership: SharedMembership) {
  const seat = JSON.stringify([membership.roomId, membership.battleId, membership.playerId, membership.clientId])
  return { prefix: `tabletop-companion.shared-outbox:${seat}`, started: `tabletop-companion.shared-started:${seat}` }
}

function batchKeys(storage: Storage, prefix: string): string[] {
  const batches: string[] = []
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (key?.startsWith(`${prefix}:`)) batches.push(key)
  }
  return batches.sort()
}

function readBatch(storage: Storage, key: string): BattleEvent[] {
  const raw = storage.getItem(key)
  if (!raw) return []
  const events: unknown = JSON.parse(raw)
  return Array.isArray(events) ? events : []
}

let lastBatchAt = 0

export function readSharedOutbox(storage: Storage | null, membership: SharedMembership): BattleEvent[] | null {
  try {
    if (!storage) return null
    const { prefix } = keys(membership)
    const batches = batchKeys(storage, prefix)
    if (!batches.length && storage.getItem(prefix) === null) return null
    return batches.flatMap(key => readBatch(storage, key))
  } catch {
    return null
  }
}

/** One atomic storage write per action batch. Independent tabs append different keys. */
export function appendSharedOutbox(storage: Storage | null, membership: SharedMembership, events: readonly BattleEvent[]): void {
  if (!storage) return
  const { prefix } = keys(membership)
  if (events.length) {
    lastBatchAt = Math.max(Date.now(), lastBatchAt + 1)
    const key = `${prefix}:${String(lastBatchAt).padStart(13, '0')}:${events[0].id}`
    storage.setItem(key, JSON.stringify(events))
  }
  if (storage.getItem(prefix) === null) storage.setItem(prefix, '1')
}

export function acknowledgeSharedOutbox(storage: Storage | null, membership: SharedMembership, acknowledged: ReadonlySet<string>): void {
  if (!storage) return
  for (const key of batchKeys(storage, keys(membership).prefix)) {
    const batch = readBatch(storage, key)
    const unsent = batch.filter(event => !acknowledged.has(event.id))
    if (unsent.length === batch.length) continue
    if (unsent.length === 0) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(unsent))
  }
}

export function readSharedStartedAt(storage: Storage | null, membership: SharedMembership): string | null {
  try {
    return storage?.getItem(keys(membership).started) ?? null
  } catch {
    return null
  }
}

export function writeSharedStartedAt(storage: Storage | null, membership: SharedMembership, startedAt: string): void {
  storage?.setItem(keys(membership).started, startedAt)
}
