import { accountClient } from '../account/client'
import { useRosterScope } from '../armyLibrary/scope'
import { validateArmy } from '../../domain/army/roster'
import type { Army } from '../../domain/army/types'

export type Profile = {
  user_id: string
  display_name: string
  friend_code: string
  avatar: string
}
export type Friend = Profile & {
  status: 'pending' | 'accepted'
  incoming: boolean
  army_count: number
}
export type GameInvite = {
  id: string
  room_id: string
  room_code: string
  sender_id: string
  recipient_id: string
  display_name: string
  expires_at: string
}
export type RoomCapability = { roomCode: string; clientId: string }
let accountGeneration = 0
useRosterScope.subscribe((state, previous) => {
  if (state.userId !== previous.userId) accountGeneration++
})

/** Capture both identity and token. Reject late results, including A → B → A. */
export async function accountRequest<T>(
  owner: string,
  run: (
    client: NonNullable<typeof accountClient>,
    token: string,
  ) => PromiseLike<{ data: T | null; error: unknown }>,
): Promise<T> {
  const generation = accountGeneration
  const current = () => {
    if (
      generation !== accountGeneration ||
      useRosterScope.getState().userId !== owner
    )
      throw new Error('The account changed. Open this page again.')
  }
  current()
  if (!accountClient) throw new Error('Accounts are not configured.')
  const { data, error } = await accountClient.auth.getSession()
  current()
  if (error) throw error
  if (!data.session || data.session.user.id !== owner)
    throw new Error('Sign in to continue.')
  const result = await run(accountClient, data.session.access_token)
  current()
  if (result.error) throw result.error
  return result.data as T
}
export function social<T>(
  owner: string,
  action: string,
  payload: Record<string, unknown> = {},
  capability?: RoomCapability,
): Promise<T> {
  return accountRequest(owner, (client, token) => {
    const request = client
      .rpc('social_action', { p_action: action, p_data: payload })
      .setHeader('Authorization', `Bearer ${token}`)
    if (capability)
      request
        .setHeader('x-room-code', capability.roomCode)
        .setHeader('x-client-id', capability.clientId)
    return request
  })
}
export async function sharedArmies(
  owner: string,
  friendId: string,
): Promise<Army[]> {
  const rows = await social<{ id: string; army: unknown }[]>(owner, 'shared', {
    user_id: friendId,
  })
  return rows.map((row) => {
    const army = validateArmy(row.army)
    if (army.id !== row.id) throw new Error('Invalid shared roster identity.')
    delete army.localMediaId
    return army
  })
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : String(error)
}
