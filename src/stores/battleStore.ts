import { create } from 'zustand'
import type { Army } from '../domain/army/types'
import {
  advancePhase,
  createBattleSession,
  dispatchBattleEvent,
  rehydrateBattleSession,
  redoLastAction,
  undoLastAction,
} from '../domain/battle/engine'
import type { BattleEventInput, BattleSession, GuidanceLevel } from '../domain/battle/types'
import {
  passReaction as passReactionInBattle,
  requestReactionHold as requestReactionHoldInBattle,
  useStratagem as useStratagemInBattle,
} from '../domain/stratagems/battleIntegration'
import type { ReactionTriggerInput, UseStratagemInput } from '../domain/stratagems/battleIntegration'
import { getBattle, getLatestActiveBattle, saveBattle } from '../persistence/database'

type BattleStore = {
  session: BattleSession | null
  loading: boolean
  error: string | null
  startBattle: (army: Army, rivalNames: string[], guidanceLevel: GuidanceLevel) => Promise<string>
  loadBattle: (id: string) => Promise<void>
  resumeLatest: () => Promise<string | null>
  dispatch: (event: BattleEventInput) => void
  useStratagem: (input: UseStratagemInput) => void
  requestReactionHold: (playerId: string, input: ReactionTriggerInput) => void
  passReaction: (reactionWindowId: string, playerId: string) => void
  nextPhase: () => void
  undo: () => void
  redo: () => void
}

let persistenceQueue = Promise.resolve()

function queueSave(session: BattleSession): void {
  persistenceQueue = persistenceQueue.catch(() => undefined).then(() => saveBattle(session))
  void persistenceQueue.catch((error: unknown) => {
    useBattleStore.setState({ error: error instanceof Error ? error.message : String(error) })
  })
}

function createId(prefix: string): string {
  const suffix = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}-${suffix}`
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  session: null,
  loading: false,
  error: null,

  async startBattle(army, rivalNames, guidanceLevel) {
    set({ loading: true, error: null })
    try {
      const ownerId = createId('player')
      const rivals = rivalNames.filter((name) => name.trim()).map((name) => ({
        id: createId('player'),
        name: name.trim(),
        faction: name.trim(),
      }))
      const players = [{ id: ownerId, name: army.faction, faction: army.faction, army }, ...rivals]
      const session = createBattleSession({
        rulesetId: 'generic-ffa',
        players,
        guidanceLevel,
        maxRounds: 5,
        objectives: [
          { id: 'A-HOME', name: 'A-HOME', type: 'home' },
          { id: 'B-HOME', name: 'B-HOME', type: 'home' },
          { id: 'C-HOME', name: 'C-HOME', type: 'home' },
          { id: 'N1', name: 'N1', type: 'neutral' },
          { id: 'N2', name: 'N2', type: 'neutral' },
          { id: 'N3', name: 'N3', type: 'neutral' },
        ],
      })
      await saveBattle(session)
      set({ session, loading: false })
      return session.setup.gameId
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      set({ loading: false, error: message })
      throw error
    }
  },

  async loadBattle(id) {
    if (get().session?.setup.gameId === id) return
    set({ loading: true, error: null })
    try {
      const stored = await getBattle(id)
      const session = stored ? rehydrateBattleSession(stored) : undefined
      set({ session: session ?? null, loading: false, error: session ? null : 'Battle not found.' })
    } catch (error: unknown) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  async resumeLatest() {
    set({ loading: true, error: null })
    try {
      const stored = await getLatestActiveBattle()
      const session = stored ? rehydrateBattleSession(stored) : undefined
      set({ session: session ?? null, loading: false })
      return session?.setup.gameId ?? null
    } catch (error: unknown) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
      return null
    }
  },

  dispatch(event) {
    const current = get().session
    if (!current) return
    try {
      const session = dispatchBattleEvent(current, event)
      set({ session, error: null })
      queueSave(session)
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  useStratagem(input) {
    const current = get().session
    if (!current) return
    try {
      const session = useStratagemInBattle(current, input)
      set({ session, error: null })
      queueSave(session)
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  requestReactionHold(playerId, input) {
    const current = get().session
    if (!current) return
    try {
      const session = requestReactionHoldInBattle(current, playerId, input)
      set({ session, error: null })
      queueSave(session)
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  passReaction(reactionWindowId, playerId) {
    const current = get().session
    if (!current) return
    try {
      const session = passReactionInBattle(current, reactionWindowId, playerId)
      set({ session, error: null })
      queueSave(session)
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  nextPhase() {
    const current = get().session
    if (!current) return
    const session = advancePhase(current)
    set({ session, error: null })
    queueSave(session)
  },

  undo() {
    const current = get().session
    if (!current) return
    const session = undoLastAction(current)
    set({ session, error: null })
    queueSave(session)
  },

  redo() {
    const current = get().session
    if (!current) return
    const session = redoLastAction(current)
    set({ session, error: null })
    queueSave(session)
  },
}))
