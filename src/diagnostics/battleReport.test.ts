import { describe, expect, it } from 'vitest'
import { testCauldronGame } from '../rulesets/cauldronFFA3/cauldronTestUtils'
import { createBattleDiagnosticReport, type DiagnosticEnvironment, type SharedDiagnosticState } from './battleReport'

describe('battle diagnostic report', () => {
  it('includes replay data but strips room and client capabilities', () => {
    const session = testCauldronGame()
    const membership = { battleId: session.setup.gameId, playerId: 'p-a', isHost: true, roomId: 'secret-room', roomCode: 'ABC234', clientId: 'secret-client' }
    const shared = {
      configured: true,
      membership,
      connectionStatus: 'connected',
      pendingEventCount: 2,
      lastSyncedAt: '2026-09-02T12:00:00.000Z',
      consecutiveFailures: 0,
      participants: [{ id: 'participant-secret', roomId: 'secret-room', clientId: 'secret-client', playerId: 'p-a', displayName: 'Alpha', isHost: true, lastSeenAt: '2026-09-02T12:00:00.000Z' }],
      roomStatus: 'active',
      error: null,
    } satisfies SharedDiagnosticState
    const environment: DiagnosticEnvironment = {
      generatedAt: '2026-09-02T12:01:00.000Z', buildSha: 'abc1234', online: true, userAgent: 'test', language: 'pl', viewport: { width: 390, height: 844 },
    }

    const report = createBattleDiagnosticReport(session, shared, environment)
    const serialized = JSON.stringify(report)
    expect(report.summary.eventCount).toBeGreaterThan(0)
    expect(report.shared.pendingEventCount).toBe(2)
    expect(serialized).not.toContain('ABC234')
    expect(serialized).not.toContain('secret-client')
    expect(serialized).not.toContain('secret-room')
    expect(serialized).not.toContain('participant-secret')
  })
})
