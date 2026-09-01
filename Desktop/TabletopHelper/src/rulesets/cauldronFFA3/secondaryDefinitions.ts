import type { SecondaryDefinition, SecondaryId } from './secondaryTypes'

const definitions: SecondaryDefinition[] = [
  { id: 'SILA_OGNIA', name: 'Siła Ognia', vp: 4, category: 'ELIMINATION', description: 'Destroy a current Rival unit in your Shooting phase.', timing: ['UNIT_DESTROYED'], evaluationMode: 'AUTOMATIC' },
  { id: 'WALKA_W_ZWARCIU', name: 'Walka w Zwarciu', vp: 4, category: 'ELIMINATION', description: 'Destroy a current Rival unit in your Fight phase.', timing: ['UNIT_DESTROYED'], evaluationMode: 'AUTOMATIC' },
  { id: 'ZNISZCZ_KOLOSA', name: 'Zniszcz Kolosa', vp: 5, category: 'ELIMINATION', description: 'Destroy a current Rival VEHICLE or MONSTER unit.', timing: ['UNIT_DESTROYED', 'ON_DRAW'], evaluationMode: 'AUTOMATIC' },
  { id: 'ELIMINACJA_DOWODCY', name: 'Eliminacja Dowódcy', vp: 5, category: 'ELIMINATION', description: 'Destroy a current Rival CHARACTER unit.', timing: ['UNIT_DESTROYED', 'ON_DRAW'], evaluationMode: 'AUTOMATIC' },
  { id: 'SZTURM_NA_POZYCJE', name: 'Szturm na Pozycję', vp: 5, category: 'OBJECTIVE', description: 'Control an objective your current Rival controlled at the start of your turn.', timing: ['END_TURN'], evaluationMode: 'AUTOMATIC' },
  { id: 'ZIEMIA_NICZYJA', name: 'Ziemia Niczyja', vp: 5, category: 'OBJECTIVE', description: 'Control at least two neutral objectives.', timing: ['END_TURN'], evaluationMode: 'AUTOMATIC' },
  { id: 'DOMINACJA_CENTRUM', name: 'Dominacja Centrum', vp: 5, category: 'POSITION', description: 'Have the unique highest total OC within 6″ of the battlefield centre.', timing: ['END_TURN'], evaluationMode: 'PARTIALLY_AUTOMATIC' },
  { id: 'ZA_LINIAMI_WROGA', name: 'Za Liniami Wroga', vp: 5, category: 'POSITION', description: 'Have a qualifying unit completely inside the current Rival deployment zone.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION' },
  { id: 'SZEROKI_FRONT', name: 'Szeroki Front', vp: 5, category: 'POSITION', description: 'Have OC>0 units in three sectors, with at least two outside your deployment zone.', timing: ['END_TURN'], evaluationMode: 'REQUIRES_CONFIRMATION' },
  { id: 'ZABEZPIECZ_DANE', name: 'Zabezpiecz Dane', vp: 5, category: 'MISSION_ACTION', description: 'Complete the action on a neutral objective and control it at end of turn.', timing: ['MISSION_ACTION', 'END_TURN'], evaluationMode: 'AUTOMATIC' },
  { id: 'SKANOWANIE_SYGNALU', name: 'Skanowanie Sygnału', vp: 5, category: 'MISSION_ACTION', description: 'Complete a Mission Action with a unit within 6″ of the battlefield centre.', timing: ['MISSION_ACTION', 'END_TURN'], evaluationMode: 'PARTIALLY_AUTOMATIC' },
  { id: 'UTRZYMAJ_BAZE', name: 'Utrzymaj Bazę', vp: 3, category: 'MIXED', description: 'Control your HOME and have no enemy unit inside your deployment zone.', timing: ['END_TURN'], evaluationMode: 'PARTIALLY_AUTOMATIC' },
  { id: 'CEL_PRIORYTETOWY', name: 'Cel Priorytetowy', vp: 5, category: 'ELIMINATION', description: 'Select a valuable Rival target and destroy it by the end of your next turn.', timing: ['ON_DRAW', 'UNIT_DESTROYED', 'END_TURN'], evaluationMode: 'TARGET_SELECTION' },
  { id: 'PRESJA_TAKTYCZNA', name: 'Presja Taktyczna', vp: 4, category: 'OBJECTIVE', description: 'Control at least two objectives and more objectives than your current Rival.', timing: ['END_TURN'], evaluationMode: 'AUTOMATIC' },
  { id: 'ODCIECIE_ODWROTU', name: 'Odcięcie Odwrotu', vp: 5, category: 'MIXED', description: 'Control a qualifying neutral objective and have an OC>0 unit near the Rival deployment zone.', timing: ['END_TURN'], evaluationMode: 'PARTIALLY_AUTOMATIC' },
]

export const CAULDRON_SECONDARY_DEFINITIONS: readonly SecondaryDefinition[] = Object.freeze(
  definitions.map((definition) => Object.freeze({ ...definition, timing: Object.freeze([...definition.timing]) })),
)

export const CAULDRON_SECONDARY_IDS: readonly SecondaryId[] = Object.freeze(
  CAULDRON_SECONDARY_DEFINITIONS.map((definition) => definition.id),
)

export const CAULDRON_SECONDARY_BY_ID: Readonly<Record<SecondaryId, SecondaryDefinition>> = Object.freeze(
  Object.fromEntries(CAULDRON_SECONDARY_DEFINITIONS.map((definition) => [definition.id, definition])) as Record<SecondaryId, SecondaryDefinition>,
)

