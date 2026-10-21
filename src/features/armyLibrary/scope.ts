import { create } from 'zustand'
export const useRosterScope = create<{ userId: string | null }>(() => ({
  userId: null,
}))
export const rosterOwner = () => useRosterScope.getState().userId
export function assertOwner(owner: string | null) {
  if (rosterOwner() !== owner)
    throw new Error('The account changed. Reopen this roster before saving.')
}
