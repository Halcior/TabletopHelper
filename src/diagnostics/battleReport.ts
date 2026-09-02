import type { BattleSession } from '../domain/battle/types'
import type { SharedConnectionStatus, SharedParticipant } from '../multiplayer/types'

export type SharedDiagnosticState = {
  configured: boolean
  membership: { playerId: string; isHost: boolean; battleId: string } | null
  connectionStatus: SharedConnectionStatus
  pendingEventCount: number
  lastSyncedAt: string | null
  consecutiveFailures: number
  participants: SharedParticipant[]
  roomStatus: string | null
  error: string | null
}

export type DiagnosticEnvironment = {
  generatedAt: string
  buildSha: string
  online: boolean | null
  userAgent: string | null
  language: string | null
  viewport: { width: number; height: number } | null
}

function browserEnvironment(): DiagnosticEnvironment {
  return {
    generatedAt: new Date().toISOString(),
    buildSha: import.meta.env.VITE_BUILD_SHA,
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
    userAgent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    language: typeof navigator === 'undefined' ? null : navigator.language,
    viewport: typeof window === 'undefined' ? null : { width: window.innerWidth, height: window.innerHeight },
  }
}

export function createBattleDiagnosticReport(
  session: BattleSession,
  shared: SharedDiagnosticState,
  environment: DiagnosticEnvironment = browserEnvironment(),
) {
  const relevantMembership = shared.membership?.battleId === session.setup.gameId ? shared.membership : null
  return {
    format: 'tabletop-companion-diagnostic',
    version: 1,
    environment,
    summary: {
      battleId: session.setup.gameId,
      rulesetId: session.setup.rulesetId,
      status: session.state.status,
      round: session.state.round,
      phase: session.state.phase,
      activePlayerId: session.state.activePlayerId,
      eventCount: session.state.events.length,
      createdAt: session.state.createdAt,
      updatedAt: session.state.updatedAt,
    },
    shared: {
      configured: shared.configured,
      active: Boolean(relevantMembership),
      playerId: relevantMembership?.playerId ?? null,
      isHost: relevantMembership?.isHost ?? false,
      connectionStatus: shared.connectionStatus,
      pendingEventCount: shared.pendingEventCount,
      lastSyncedAt: shared.lastSyncedAt,
      consecutiveFailures: shared.consecutiveFailures,
      roomStatus: shared.roomStatus,
      error: shared.error,
      participants: shared.participants.map((participant) => ({
        playerId: participant.playerId,
        displayName: participant.displayName,
        isHost: participant.isHost,
        lastSeenAt: participant.lastSeenAt,
      })),
    },
    session,
  }
}

export function downloadBattleDiagnosticReport(session: BattleSession, shared: SharedDiagnosticState): void {
  const report = createBattleDiagnosticReport(session, shared)
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tabletop-diagnostic-${session.setup.gameId}-${Date.now()}.json`
  link.click()
  URL.revokeObjectURL(url)
}
