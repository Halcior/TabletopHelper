import { describe, expect, it } from 'vitest'
import { createCauldronGame } from '../../rulesets/cauldronFFA3/session'
import { testArmy } from '../../rulesets/cauldronFFA3/cauldronTestUtils'
import { defaultBattlefieldGeometry, battlefieldPresentation, officialBoardDefinition, OFFICIAL_LAYOUTS, OFFICIAL_BOARD_SOURCE, FOOTPRINT_LIBRARY, DISPOSITION_ORDER } from './layouts'
import { terrainWorldPoints } from '../../components/battle/BattlefieldMapSvg'
import { buildBattlefieldReplay } from './replay'
import { deserializeBattleSession, dispatchBattleEvent, serializeBattleSession } from '../battle/engine'
import type { ForceDisposition } from '../../rulesets/cauldronFFA3/duelPrimary'

function duel(a: string, b: string, variant: number) {
  return createCauldronGame({ guidanceLevel:'fast', primaryDeck:'chapter-approved-duel',secondaryDeck:'chapter-approved',officialLayout:variant as 1|2|3,
    armies:[testArmy('a'),testArmy('b')],players:['a','b'].map((id,i)=>({ id,name:id,armyId:id,deploymentZone:i===0?'A':'B',turnPosition:i+1 as 1|2,
      operationalPlanId:'WYNISZCZENIE',forceDisposition:(i===0?a:b) as ForceDisposition })) })
}

describe('Event Companion 1.3 terrain catalogue', () => {
  it('has all 15 pairings × A/B/C, with no empty or fallback map', () => {
    expect(Object.keys(OFFICIAL_LAYOUTS)).toHaveLength(45)
    for(let i=0;i<DISPOSITION_ORDER.length;i++) for(const b of DISPOSITION_ORDER.slice(i)) for(const variant of ['A','B','C']) {
      const key=[DISPOSITION_ORDER[i],b,variant].join('|')
      const map=OFFICIAL_LAYOUTS[key]
      expect(map.layoutId).toBe(key)
      expect(map.terrainAreas).toHaveLength(16)
      expect(map.sourceHash).toBe(OFFICIAL_BOARD_SOURCE.sha256)
      expect(map.page).toBeGreaterThanOrEqual(9)
      expect(map.page).toBeLessThanOrEqual(53)
      expect(map.deploymentPaths.attacker).toMatch(/^M /)
      expect(map.deploymentPaths.defender).toMatch(/^M /)
      expect(map.territoryPaths.length).toBeGreaterThan(0)
      expect(map.widthCm).toBe(44*2.54)
      expect(map.heightCm).toBe(60*2.54)
      const ids=new Set(map.terrainAreas!.map(area=>area.id))
      expect(ids.size).toBe(16)
      for(const [kind,size] of Object.entries(FOOTPRINT_LIBRARY)) expect(map.terrainAreas!.filter(area=>area.footprintType===kind)).toHaveLength(size.quantity)
      for(const area of map.terrainAreas!) {
        expect(area.polygonPoints.length).toBeGreaterThan(8)
        expect(area.rotationDeg).toBeGreaterThanOrEqual(0)
        expect(area.rotationDeg).toBeLessThan(360)
        const xs=area.polygonPoints.map(p=>p.x),ys=area.polygonPoints.map(p=>p.y)
        expect(Math.max(...xs)-Math.min(...xs)).toBeCloseTo(area.widthCm,3)
        expect(Math.max(...ys)-Math.min(...ys)).toBeCloseTo(area.heightCm,3)
        for(const p of terrainWorldPoints(area)) {
          expect(p.x,`${key} ${area.id}`).toBeGreaterThanOrEqual(0)
          expect(p.x,`${key} ${area.id}`).toBeLessThanOrEqual(map.widthCm)
          expect(p.y,`${key} ${area.id}`).toBeGreaterThanOrEqual(0)
          expect(p.y,`${key} ${area.id}`).toBeLessThanOrEqual(map.heightCm)
        }
      }
      for(const targets of Object.values(map.objectiveAssignments!)) {
        expect(targets.length).toBeGreaterThan(0)
        expect(targets.every(id=>ids.has(id))).toBe(true)
      }
      expect(map.terrainFeatures!.every(f=>ids.has(f.terrainAreaId))).toBe(true)
    }
  })

  it('records nominal dimensions separately from irregular source outlines',()=>{
    expect(FOOTPRINT_LIBRARY.A).toMatchObject({nominalWidthCm:15.24,nominalHeightCm:10.16,quantity:4})
    expect(FOOTPRINT_LIBRARY.B.nominalWidthCm).toBe(25.4)
    expect(FOOTPRINT_LIBRARY.C.nominalHeightCm).toBe(5.08)
    expect(FOOTPRINT_LIBRARY.D.nominalHeightCm).toBe(29.21)
    expect(FOOTPRINT_LIBRARY.E.nominalHeightCm).toBe(29.21)
  })

  it('uses independent p9 callouts: D1 left edge near 14 inches, top near 6 inches',()=>{
    const map=OFFICIAL_LAYOUTS['take-and-hold|take-and-hold|A']
    const area=map.terrainAreas!.find(a=>a.id==='D1')!
    const vertices=terrainWorldPoints(area)
    expect(Math.min(...vertices.map(p=>p.x))/2.54).toBeCloseTo(14,0)
    expect(Math.min(...vertices.map(p=>p.y))/2.54).toBeCloseTo(6,0)
    expect(area.rotationDeg).toBe(0)
    expect(map.objectiveAssignments!['attacker-home']).toEqual(['D1'])
  })

  it('pins new sessions and round-trips terrain source through reconnect serialization',()=>{
    const session=duel('take-and-hold','purge-the-foe',2)
    expect(session.setup.battlefieldSourceId).toBe(OFFICIAL_BOARD_SOURCE.id)
    const restored=deserializeBattleSession(serializeBattleSession(session))
    expect(restored.setup.battlefieldSourceId).toBe(OFFICIAL_BOARD_SOURCE.id)
    expect(restored.state.battlefield).toEqual(session.state.battlefield)
    expect(battlefieldPresentation(restored.setup,restored.state.battlefield!).terrain?.terrainAreas).toHaveLength(16)
    const mapped=dispatchBattleEvent(restored,{type:'BATTLEFIELD_LAYOUT_CHANGED',payload:{geometry:defaultBattlefieldGeometry(restored.setup,'B')}})
    const frames=buildBattlefieldReplay(mapped)
    expect(frames.at(-1)!.geometry.attackerHomeZone).toBe('B')
    expect(frames[0].geometry.attackerHomeZone).toBe('A')
    expect(mapped.state.players).toEqual(session.state.players)
  })

  it('retains old June geometry, including old coordinates, throughout replay',()=>{
    const old=duel('take-and-hold','take-and-hold',2)
    delete old.setup.battlefieldSourceId
    old.state.battlefield=defaultBattlefieldGeometry(old.setup)
    const geometry=structuredClone(old.state.battlefield)
    const restored=deserializeBattleSession(serializeBattleSession(old))
    expect(restored.setup.battlefieldSourceId).toBeUndefined()
    expect(restored.state.battlefield).toEqual(geometry)
    expect(battlefieldPresentation(restored.setup,geometry!).sourceVersion).toBe('1.0')
    expect(battlefieldPresentation(restored.setup,geometry!).terrain).toBeUndefined()
    expect(buildBattlefieldReplay(restored).every(frame=>JSON.stringify(frame.geometry)===JSON.stringify(geometry))).toBe(true)
    expect(officialBoardDefinition(restored.setup)?.objectives).not.toEqual(OFFICIAL_LAYOUTS['take-and-hold|take-and-hold|B'].objectives)
  })
})
