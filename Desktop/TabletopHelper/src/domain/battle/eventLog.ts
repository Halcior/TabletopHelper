import type { BattleEvent, BattleSetup } from './types'

function playerName(setup: BattleSetup, playerId: string): string {
  return setup.players.find((player) => player.id === playerId)?.name ?? playerId
}

function unitName(setup: BattleSetup, playerId: string, unitId: string): string {
  const armyId = setup.players.find((player) => player.id === playerId)?.armyId
  return (armyId ? setup.armies[armyId]?.units.find((unit) => unit.id === unitId)?.name : undefined) ?? unitId
}

export function describeBattleEvent(event: BattleEvent, setup: BattleSetup): string {
  switch (event.type) {
    case 'GAME_STARTED': return 'Battle started'
    case 'GAME_ENDED': return 'Battle ended'
    case 'ROUND_STARTED': return `Round ${event.payload.round} started`
    case 'ROUND_ENDED': return `Round ${event.payload.round} ended`
    case 'TURN_STARTED': return `${playerName(setup, event.payload.playerId)} turn started`
    case 'TURN_ENDED': return `${playerName(setup, event.payload.playerId)} turn ended`
    case 'PHASE_CHANGED': return `Phase changed to ${event.payload.phase.replace('_', ' ').toLowerCase()}`
    case 'CP_GAINED': return `${playerName(setup, event.payload.playerId)} gained ${event.payload.amount} CP`
    case 'CP_SPENT': return `${playerName(setup, event.payload.playerId)} spent ${event.payload.amount} CP`
    case 'SCORE_ADJUSTED': return `${playerName(setup, event.payload.playerId)} ${event.payload.category} ${event.payload.delta >= 0 ? '+' : ''}${event.payload.delta} VP`
    case 'UNIT_MODEL_DESTROYED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)} lost ${event.payload.amount} model`
    case 'UNIT_MODEL_RESTORED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)} restored ${event.payload.amount} model`
    case 'UNIT_WOUNDS_CHANGED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)} set to ${event.payload.woundsRemaining} wounds`
    case 'UNIT_DESTROYED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)} destroyed`
    case 'UNIT_BATTLESHOCK_CHANGED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)} battle-shock ${event.payload.battleShocked ? 'on' : 'off'}`
    case 'ABILITY_USED': return `${unitName(setup, event.payload.playerId, event.payload.unitId)}: ${event.payload.abilityName} ${event.payload.used ? 'used' : 'restored'}`
    case 'OBJECTIVE_OC_CHANGED': return `${event.payload.objectiveId}: ${playerName(setup, event.payload.playerId)} OC ${event.payload.oc}`
    case 'OBJECTIVE_CONTROL_CHANGED': return `${event.payload.objectiveId}: ${event.payload.controllerPlayerId ? playerName(setup, event.payload.controllerPlayerId) : 'uncontrolled'}`
    case 'RULESET_EVENT': return `${event.payload.rulesetId}: ${event.payload.action.replaceAll('_', ' ').toLowerCase()}`
  }
}
