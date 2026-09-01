export type SecondaryId =
  | 'SILA_OGNIA'
  | 'WALKA_W_ZWARCIU'
  | 'ZNISZCZ_KOLOSA'
  | 'ELIMINACJA_DOWODCY'
  | 'SZTURM_NA_POZYCJE'
  | 'ZIEMIA_NICZYJA'
  | 'DOMINACJA_CENTRUM'
  | 'ZA_LINIAMI_WROGA'
  | 'SZEROKI_FRONT'
  | 'ZABEZPIECZ_DANE'
  | 'SKANOWANIE_SYGNALU'
  | 'UTRZYMAJ_BAZE'
  | 'CEL_PRIORYTETOWY'
  | 'PRESJA_TAKTYCZNA'
  | 'ODCIECIE_ODWROTU'

export type SecondaryCategory = 'ELIMINATION' | 'OBJECTIVE' | 'POSITION' | 'MISSION_ACTION' | 'MIXED'
export type SecondaryEvaluationMode =
  | 'AUTOMATIC'
  | 'PARTIALLY_AUTOMATIC'
  | 'REQUIRES_CONFIRMATION'
  | 'TARGET_SELECTION'
export type SecondaryTiming = 'UNIT_DESTROYED' | 'END_TURN' | 'MISSION_ACTION' | 'ON_DRAW'

export type SecondaryDefinition = Readonly<{
  id: SecondaryId
  name: string
  vp: 3 | 4 | 5
  category: SecondaryCategory
  description: string
  timing: readonly SecondaryTiming[]
  evaluationMode: SecondaryEvaluationMode
}>

export type SecondaryCardStatus =
  | 'DECK'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'DISCARDED_INCOMPLETE'
  | 'COMPLETED_ARCHIVE'

export type SecondaryCardSpecificState = {
  priorityCandidateUnitIds?: string[]
  priorityTargetUnitId?: string
  boundRivalPlayerId?: string
  deadlineRound?: number
  deadlineTurn?: number
  deadlineFailed?: boolean
  centreOcByPlayer?: Record<string, number>
  lastConfirmation?: string
}

export type SecondaryCardState = {
  cardId: SecondaryId
  playerId: string
  status: SecondaryCardStatus
  drawnRound?: number
  drawnTurn?: number
  completedRound?: number
  completedTurn?: number
  discardedRound?: number
  discardedTurn?: number
  pointsAwarded: number
  cardSpecificState?: SecondaryCardSpecificState
}

export type PendingEliminationChoice = {
  playerId: string
  destroyedPlayerId: string
  destroyedUnitId: string
  destroyedUnitName: string
  killEventId: string
  matchingCardIds: SecondaryId[]
}

export type SecondaryScoreEntry = {
  cardId: SecondaryId
  cardName: string
  round: number
  pointsAwarded: number
}

export type PlayerSecondaryState = {
  playerId: string
  deck: SecondaryId[]
  active: SecondaryCardState[]
  discarded: SecondaryCardState[]
  completed: SecondaryCardState[]
  mulliganUsedTurnKey?: string
  pendingEliminationChoice?: PendingEliminationChoice
  scoreHistory: SecondaryScoreEntry[]
}

export type SecondaryState = Record<string, PlayerSecondaryState>

export type EndTurnSecondaryConfirmations = {
  centreOcByPlayer?: Record<string, number>
  behindEnemyLines?: boolean
  wideFrontThreeSectors?: boolean
  wideFrontTwoOutsideDeployment?: boolean
  noEnemyInOwnDeployment?: boolean
  unitNearRivalDeployment?: boolean
  controlsClosestNeutralObjective?: boolean
}

export type ActiveSecondaryView = {
  cardId: SecondaryId
  name: string
  vp: number
  objective: string
  status: 'INCOMPLETE' | 'COMPLETED' | 'INPUT_REQUIRED' | 'DECISION_REQUIRED' | 'DEADLINE_FAILED'
  progress: string
  pointsAwarded: number
  action: 'OPEN_RIVAL_ARMY' | 'QUICK_OBJECTIVES' | 'START_MISSION_ACTION' | 'CHECK_CONDITION' | 'SELECT_TARGET' | null
}

export type EndTurnReview = {
  playerId: string
  missionActions: Array<{ name: string; unitName: string; status: string; detail: string }>
  secondaries: ActiveSecondaryView[]
  roundSecondaryVp: number
  roundCap: 10
  gameSecondaryVp: number
  gameCap: 45
  incompleteCards: Array<{ cardId: SecondaryId; name: string }>
}

