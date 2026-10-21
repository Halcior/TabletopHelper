import { create } from 'zustand'
import { copyRoster } from '../../domain/army/roster'
import { createPortableUuid } from '../../multiplayer/uuid'
import { database, type AccountArmy } from '../../persistence/storage'
import { cloudTransport, type CloudArmy, type CloudTransport } from './cloud'
import { copyPhotos } from './repository'
import { rosterOwner } from './scope'
import { cloudMediaId } from './identity'

export const useSyncState = create<{
  owner: string | null
  busy: boolean
  error?: string
  lastSync?: string
}>(() => ({ owner: null, busy: false }))
const running = new Map<string, Promise<void>>()

function remoteRecord(row: CloudArmy, previous?: AccountArmy): AccountArmy {
  return {
    id: row.id,
    ownerId: row.user_id,
    army: {
      ...structuredClone(row.army_data),
      localMediaId: cloudMediaId(row.user_id, row.id),
    },
    savedAt: row.updated_at,
    changeId: row.mutation_id,
    revision: row.revision,
    pending: false,
    deleted: !!row.deleted_at,
    status: 'synced',
    sourceLocalId: row.source_local_id ?? previous?.sourceLocalId,
    conflictNote: previous?.conflictNote,
  }
}

async function receive(owner: string, remote: CloudArmy) {
  await database.transaction('rw', database.accountArmies, async () => {
    const current = await database.accountArmies.get([owner, remote.id])
    if (!current || (!current.pending && remote.revision > current.revision))
      await database.accountArmies.put(remoteRecord(remote, current))
  })
}

async function acknowledge(
  owner: string,
  sent: AccountArmy,
  response: { applied: boolean; row: CloudArmy },
) {
  await database.transaction(
    'rw',
    database.accountArmies,
    database.visualMedia,
    async () => {
      const current = await database.accountArmies.get([owner, sent.id])
      if (!current) return
      const sameEdit = current.changeId === sent.changeId
      const remote = response.row
      if (response.applied && sameEdit) {
        await database.accountArmies.put(remoteRecord(remote, current))
      } else if (response.applied && !sameEdit) {
        // A newer local edit happened while the request was in flight. Keep it
        // queued, now based on the revision that the server just accepted.
        if (current.revision <= remote.revision)
          await database.accountArmies.put({
            ...current,
            revision: remote.revision,
          })
      } else if (sameEdit) {
        // Never silently overwrite competing work or resurrect a tombstone.
        if (!current.deleted) {
          const copy = copyRoster(
            current.army,
            `${current.army.name} — conflict copy`,
          )
          copy.localMediaId = cloudMediaId(owner, copy.id)
          await database.accountArmies.put({
            id: copy.id,
            ownerId: owner,
            army: copy,
            savedAt: new Date().toISOString(),
            changeId: createPortableUuid(),
            revision: 0,
            pending: true,
            status: 'pending',
            conflictNote: remote.deleted_at
              ? 'The original was deleted on another device. Your edits were preserved here.'
              : 'Another device edited this roster. Your local version was preserved here.',
          })
          await copyPhotos(current.army, copy)
        }
        await database.accountArmies.put({
          ...remoteRecord(remote, current),
          conflictNote: current.deleted
            ? 'Deletion was not applied because this roster changed on another device. Review it before deleting again.'
            : undefined,
        })
      }
    },
  )
}

/** Persisted outbox, server CAS, idempotent retries; no timestamp winner. */
export function syncArmies(
  owner = rosterOwner(),
  transport: CloudTransport = cloudTransport,
): Promise<void> {
  if (!owner) return Promise.resolve()
  const existing = running.get(owner)
  if (existing) return existing
  const work = (async () => {
    useSyncState.setState({ owner, busy: true, error: undefined })
    try {
      const remote = await transport.list(owner)
      if (rosterOwner() !== owner) return
      for (const row of remote) await receive(owner, row)
      const pending = (
        await database.accountArmies.where('ownerId').equals(owner).toArray()
      ).filter((r) => r.pending)
      for (const row of pending) {
        if (rosterOwner() !== owner) return
        try {
          const response = await transport.write(owner, row)
          // A response for A can only ever write into A's cache, even when the
          // active account changed during the network request.
          await acknowledge(owner, row, response)
        } catch (reason) {
          const message =
            reason instanceof Error ? reason.message : String(reason)
          await database.transaction('rw', database.accountArmies, async () => {
            const current = await database.accountArmies.get([owner, row.id])
            if (current?.changeId === row.changeId)
              await database.accountArmies.put({
                ...current,
                status: 'error',
                error: message,
              })
          })
          throw reason
        }
      }
      if (rosterOwner() === owner)
        useSyncState.setState({
          owner,
          lastSync: new Date().toISOString(),
          error: undefined,
        })
    } catch (reason) {
      if (rosterOwner() === owner)
        useSyncState.setState({
          owner,
          error: reason instanceof Error ? reason.message : String(reason),
        })
    } finally {
      if (useSyncState.getState().owner === owner)
        useSyncState.setState({ busy: false })
      running.delete(owner)
    }
  })()
  running.set(owner, work)
  return work
}
