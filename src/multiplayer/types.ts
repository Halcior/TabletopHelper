import type { BattleEvent, BattleLifecycleStatus, BattleSession } from '../domain/battle/types'

export type SharedConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type SharedParticipant = {
  id: string
  roomId: string
  clientId: string
  playerId: string
  displayName: string
  isHost: boolean
  lastSeenAt: string
}

export type SharedRoom = {
  id: string
  code: string
  battleId: string
  status: BattleLifecycleStatus
  sessionSnapshot: BattleSession
  createdAt: string
  updatedAt: string
}

export type SharedRoomInspection = {
  room: SharedRoom
  participants: SharedParticipant[]
}

export type SharedEventEnvelope = {
  sequence: number
  roomId: string
  event: BattleEvent
  receivedAt?: string
}

export type SharedMembership = {
  roomId: string
  roomCode: string
  battleId: string
  clientId: string
  playerId: string
  isHost: boolean
}

export interface SharedSessionTransport {
  readonly configured: boolean
  createRoom(session: BattleSession, hostPlayerId: string, clientId: string): Promise<SharedRoomInspection>
  inspectRoom(code: string): Promise<SharedRoomInspection | null>
  joinRoom(room: SharedRoom, playerId: string, clientId: string): Promise<SharedParticipant>
  publishEvents(roomId: string, events: BattleEvent[], submittedByPlayerId?: string): Promise<void>
  listEvents(roomId: string, afterSequence: number): Promise<SharedEventEnvelope[]>
  listParticipants(roomId: string): Promise<SharedParticipant[]>
  touchParticipant(roomId: string, clientId: string): Promise<void>
  updateRoomStatus(roomId: string, status: BattleLifecycleStatus): Promise<void>
}
