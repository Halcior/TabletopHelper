import { create } from 'zustand'
import type { Army } from '../domain/army/types'
import {
  advancePhase,
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
import {
  advanceCauldronPhase,
  CAULDRON_RULESET_ID,
  changeOperationalPlan,
  confirmCauldronEndRound,
  createCauldronGame,
  type CauldronPlayerInput,
  type OperationalPlanId,
  type PlanConfirmation,
} from '../rulesets/cauldronFFA3'

type BattleStore = {
  session: BattleSession | null
  loading: boolean
  error: string | null
  startCauldronBattle: (
    players: CauldronPlayerInput[],
    armies: Army[],
    guidanceLevel: GuidanceLevel,
  ) => Promise<string>
  loadBattle: (id: string) => Promise<void>
  resumeLatest: () => Promise<string | null>
  dispatch: (event: BattleEventInput) => void
  useStratagem: (input: UseStratagemInput) => void
  requestReactionHold: (playerId: string, input: ReactionTriggerInput) => void
  passReaction: (reactionWindowId: string, playerId: string) => void
  nextPhase: () => void
  changePlan: (playerId: string, planId: OperationalPlanId) => void
  confirmRound: (confirmations: Record<string, PlanConfirmation>) => void
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

function applySessionUpdate(
  current: BattleSession | null,
  update: (session: BattleSession) => BattleSession,
  set: (state: Partial<BattleStore>) => void,
): void {
  if (!current) return
  try {
    const session = update(current)
    set({ session, error: null })
    queueSave(session)
  } catch (error: unknown) {
    set({ error: error instanceof Error ? error.message : String(error) })
  }
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  session: null,
  loading: false,
  error: null,

  async startCauldronBattle(players, armies, guidanceLevel) {
    set({ loading: true, error: null })
    try {
      const session = createCauldronGame({ players, armies, guidanceLevel })
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
    applySessionUpdate(get().session, (session) => dispatchBattleEvent(session, event), set)
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
    applySessionUpdate(get().session, (session) => (
      session.setup.rulesetId === CAULDRON_RULESET_ID ? advanceCauldronPhase(session) : advancePhase(session)
    ), set)
  },

  changePlan(playerId, planId) {
    applySessionUpdate(get().session, (session) => changeOperationalPlan(session, playerId, planId), set)
  },

  confirmRound(confirmations) {
    applySessionUpdate(get().session, (session) => confirmCauldronEndRound(session, confirmations), set)
  },

  undo() {
    applySessionUpdate(get().session, undoLastAction, set)
  },

  redo() {
    applySessionUpdate(get().session, redoLastAction, set)
  },
}))
