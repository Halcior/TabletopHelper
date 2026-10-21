import type { Army } from '../../domain/army/types'
import { validateArmy } from '../../domain/army/roster'
import type { AccountArmy } from '../../persistence/storage'
import { accountClient } from '../account/client'

export type CloudArmy = {
  id: string
  user_id: string
  army_data: Army
  revision: number
  mutation_id: string
  updated_at: string
  deleted_at: string | null
  source_local_id?: string | null
}
export type CloudTransport = {
  list(owner: string): Promise<CloudArmy[]>
  write(
    owner: string,
    row: AccountArmy,
  ): Promise<{ applied: boolean; row: CloudArmy }>
}

async function clientFor(owner: string) {
  if (!accountClient)
    throw new Error(
      'Cloud sync is not configured. Your rosters are saved locally.',
    )
  const { data, error } = await accountClient.auth.getSession()
  if (error) throw error
  if (data.session?.user.id !== owner)
    throw new Error('Sign in to this account to sync its rosters.')
  return accountClient
}
function parseRow(raw: CloudArmy, owner: string): CloudArmy {
  if (
    raw.user_id !== owner ||
    raw.army_data.id !== raw.id ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision < 1
  )
    throw new Error('Invalid cloud roster response.')
  return { ...raw, army_data: validateArmy(raw.army_data) }
}
export const cloudTransport: CloudTransport = {
  async list(owner) {
    const client = await clientFor(owner)
    const rows: CloudArmy[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client
        .from('user_armies')
        .select(
          'id,user_id,army_data,revision,mutation_id,updated_at,deleted_at,source_local_id',
        )
        .eq('user_id', owner)
        .order('id')
        .range(offset, offset + 499)
      if (error) throw error
      rows.push(...(data as CloudArmy[]).map((r) => parseRow(r, owner)))
      if (data.length < 500) return rows
      await clientFor(owner)
    }
  },
  async write(owner, row) {
    const client = await clientFor(owner)
    const { localMediaId: _localMediaId, ...armyData } = row.army
    const { data, error } = await client.rpc('save_user_army', {
      p_id: row.id,
      p_expected_revision: row.revision,
      p_mutation_id: row.changeId,
      p_army_data: armyData,
      p_deleted: !!row.deleted,
      p_source_local_id: row.sourceLocalId ?? null,
    })
    if (error) throw error
    return { applied: Boolean(data.applied), row: parseRow(data.row, owner) }
  },
}
