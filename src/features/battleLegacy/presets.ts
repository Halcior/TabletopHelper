import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'
import { database } from '../../persistence/storage'
import type { RematchPreset } from './rematch'
import { legacyOwner } from './repository'

export function useBattlePresets(owner: string) {
  const [result, setResult] = useState<{ owner: string; presets: RematchPreset[]; error?: string }>()

  useEffect(() => {
    const subscription = liveQuery(() => database.battlePresets.where('ownerId').equals(owner).sortBy('name')).subscribe({
      next: (presets) => setResult({ owner, presets }),
      error: (error) => setResult({ owner, presets: [], error: error instanceof Error ? error.message : String(error) }),
    })
    return () => subscription.unsubscribe()
  }, [owner])

  return result?.owner === owner ? result : { presets: [], error: undefined }
}

export async function setBattlePresetPinned(owner: string, id: string, pinned: boolean) {
  if (legacyOwner() !== owner) throw new Error('The account changed. Open this page again.')
  const updated = await database.battlePresets.where('[ownerId+id]').equals([owner, id]).modify({ pinned })
  if (!updated) throw new Error('Battle preset is unavailable in this account.')
}
