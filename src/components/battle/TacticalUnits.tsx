import { useEffect, useMemo, useRef, useState, type PointerEvent, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import type { BoardPoint, BattlefieldGeometry } from '../../domain/battlefield/types'
import type { BattlefieldReplayFrame } from '../../domain/battlefield/replay'
import { battlefieldView } from '../../domain/battlefield/layouts'
import { unitMapChangeInput, unitMapKey, type UnitMapChange } from '../../domain/battlefield/unitTracking'
import type { SharedMembership } from '../../multiplayer/types'
import { groupUnitMarkers, placeUnitMarkers } from './unitMarkerLayout'
import { AppIcon } from '../AppIcon'

type Token = { key: string; playerId: string; unitId: string; name: string; short: string; owner: string; color: string; status: string; position: BoardPoint | null; models: number; shocked: boolean; destroyed: boolean }
type Drag = { token: Token; startX: number; startY: number; revision: string | null; moved: boolean; pointerId: number }
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const statusName = (status: string) => ({ unplaced: 'Unplaced', battlefield: 'On Battlefield', reserves: 'In Reserves', destroyed: 'Destroyed' })[status] ?? status

export function TacticalUnits({ session, dispatch, canvas, geometry, rotated, canvasSize, frame, replay, membership, active }: {
  session: BattleSession; dispatch: (event: BattleEventInput) => void
  canvas: HTMLDivElement | null; geometry: BattlefieldGeometry; rotated: boolean
  canvasSize: { width: number; height: number }; frame?: BattlefieldReplayFrame; replay: boolean
  membership: SharedMembership | null; active: boolean
}) {
  const tracking = replay ? frame?.unitTracking : session.state.unitTracking
  const shared = membership?.battleId === session.setup.gameId
  const live = !replay && session.state.status === 'active' && active
  const canConfigure = live && (!shared || membership?.isHost)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [hiddenPlayers, setHiddenPlayers] = useState<string[]>([])
  const [labels, setLabels] = useState(false)
  const [onlyPlayer, setOnlyPlayer] = useState('all')
  const [preview, setPreview] = useState<{ key: string; point: BoardPoint } | null>(null)
  const [coordinates, setCoordinates] = useState({ x: '50', y: '50' })
  const [notice, setNotice] = useState('')
  const dragging = useRef<Drag | null>(null)
  const view = battlefieldView(geometry.widthCm, geometry.heightCm, rotated)
  const tokens = useMemo<Token[]>(() => session.setup.players.flatMap((player, index) => {
    const definitions = player.armyId ? session.setup.armies[player.armyId]?.units ?? [] : []
    const counts = new Map<string, number>()
    const totals = new Map<string, number>()
    for (const definition of definitions) totals.set(definition.name, (totals.get(definition.name) ?? 0) + 1)
    return definitions.map((definition) => {
      const count = (counts.get(definition.name) ?? 0) + 1
      counts.set(definition.name, count)
      const duplicate = (totals.get(definition.name) ?? 0) > 1
      const key = unitMapKey(player.id, definition.id)
      const unit = replay ? frame?.units[player.id]?.[definition.id] : session.state.players[player.id]?.units[definition.id]
      const entry = tracking?.units[key]
      return { key, playerId: player.id, unitId: definition.id, name: `${definition.name}${duplicate ? ` ${count}` : ''}`,
        short: `${definition.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}${duplicate ? count : ''}`,
        owner: player.name, color: `var(--player-${index}, var(--gold))`, status: unit?.destroyed ? 'destroyed' : entry?.status ?? 'unplaced',
        position: entry?.position ?? null, models: unit?.modelsAlive ?? definition.startingModels, shocked: unit?.battleShocked ?? false, destroyed: unit?.destroyed ?? false }
    })
  }), [session.setup, session.state.players, tracking, replay, frame])
  const selected = tokens.find(token => token.key === selectedKey)
  const selectedArmyId = selected ? session.state.players[selected.playerId]?.armyId : undefined
  const selectedDefinition = selectedArmyId ? session.setup.armies[selectedArmyId]?.units.find(unit => unit.id === selected?.unitId) : undefined
  const canMove = (token: Token) => live && Boolean(tracking?.enabled) && !token.destroyed && (!shared || membership?.isHost === true || membership?.playerId === token.playerId)
  const visible = tokens.filter(token => !hiddenPlayers.includes(token.playerId) && (onlyPlayer === 'all' || onlyPlayer === token.playerId))
  const onBoard = visible.filter(token => token.status === 'battlefield' && token.position)
  const groups = useMemo(() => groupUnitMarkers(onBoard.map(token => ({ key: token.key, point: view.toDisplay(token.position!) })), canvasSize.width, canvasSize.height), [tokens, hiddenPlayers, onlyPlayer, rotated, canvasSize])
  const clusteredKeys = new Set(groups.filter(group => group.members.length > 1).flatMap(group => group.members))
  const renderedTokens = onBoard.filter(token => !clusteredKeys.has(token.key) || token.key === selectedKey)
  const clusters = groups.filter(group => group.members.length > 1)
  const expanded = clusters.find(group => group.key === expandedCluster)
  const layout = useMemo(() => placeUnitMarkers([...groups, ...renderedTokens.filter(token => clusteredKeys.has(token.key)).map(token => ({ key: token.key, point: view.toDisplay(token.position!) }))],
    Object.values(geometry.positions).filter((p): p is BoardPoint => Boolean(p)).map(view.toDisplay), canvasSize.width, canvasSize.height), [tokens, hiddenPlayers, onlyPlayer, selectedKey, geometry, rotated, canvasSize])
  const guides = [...groups, ...renderedTokens.filter(token => clusteredKeys.has(token.key)).map(token => ({ key: token.key, point: view.toDisplay(token.position!) }))].flatMap(marker => {
    const icon = layout.get(marker.key)!
    const origin = { x: marker.point.x * Math.max(80, canvasSize.width), y: marker.point.y * Math.max(80, canvasSize.height) }
    return Math.hypot(origin.x - icon.x, origin.y - icon.y) > 12 ? [{ key: marker.key, origin, icon }] : []
  })

  useEffect(() => {
    setPlacing(false); setPreview(null); dragging.current = null
  }, [replay, replay ? frame?.index : null, active, rotated])
  useEffect(() => {
    if (!selected) return
    const point = selected.position ? view.toDisplay(selected.position) : { x: .5, y: .5 }
    setCoordinates({ x: String(Math.round(point.x * 1000) / 10), y: String(Math.round(point.y * 1000) / 10) })
  }, [selectedKey, selected?.position?.x, selected?.position?.y, rotated])

  function pointAt(clientX: number, clientY: number): BoardPoint | null {
    if (!canvas) return null
    const box = canvas.getBoundingClientRect()
    if (clientX < box.left || clientX > box.right || clientY < box.top || clientY > box.bottom) return null
    return view.toSource({ x: clamp((clientX - box.left) / box.width), y: clamp((clientY - box.top) / box.height) })
  }
  function commit(token: Token, status: UnitMapChange['status'], point: BoardPoint | null) {
    if (!canMove(token)) return
    dispatch(unitMapChangeInput(session.state, token.playerId, token.unitId, status, point))
    setPlacing(false)
  }
  function beginDrag(event: PointerEvent<HTMLButtonElement>, token: Token, tray = false) {
    if (!canMove(token) || (event.button !== 0 && event.pointerType === 'mouse')) return
    if (selectedKey !== token.key) { setSelectedKey(token.key); if (event.pointerType !== 'mouse') return }
    // First tap selects, a second gesture drags. Touch scrolling remains available on unselected rows.
    if (!tray && token.status !== 'battlefield') return
    dragging.current = { token, startX: event.clientX, startY: event.clientY, revision: session.state.unitTracking?.units[token.key]?.revision ?? null,
      moved: false, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (event.pointerType === 'mouse') event.preventDefault()
    setPlacing(false)
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return
    drag.moved = true
    const point = pointAt(event.clientX, event.clientY)
    setPreview(point ? { key: drag.token.key, point } : null)
  }
  function finishDrag(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const drag = dragging.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const point = pointAt(event.clientX, event.clientY)
    // Do not rebase a gesture over a concurrent accepted update from another device.
    if (!cancel && drag.moved && point) {
      const current = session.state.unitTracking?.units[drag.token.key]?.revision ?? null
      if (drag.revision === current) commit(drag.token, 'battlefield', point)
      else setNotice('Position changed on another device. Select the unit and try again.')
    }
    setPreview(null)
  }
  function select(token: Token) {
    setSelectedKey(token.key); setPlacing(false); setNotice('')
  }
  const dragHandlers = (token: Token, tray = false) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => beginDrag(event, token, tray),
    onPointerMove: moveDrag,
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finishDrag(event),
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finishDrag(event, true),
    onLostPointerCapture: () => { dragging.current = null; setPreview(null) },
  })
  function armPlacement() {
    setPlacing(true)
    canvas?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  function placeSelected(clientX: number, clientY: number) {
    const point = pointAt(clientX, clientY)
    if (point && selected) commit(selected, 'battlefield', point)
  }
  const combat = replay ? frame?.combat : undefined
  const attackFrom = combat?.attacker?.position ? view.toDisplay(combat.attacker.position) : null
  const attackTo = combat?.target.position ? view.toDisplay(combat.target.position) : null
  const combatKeys = [combat?.attacker, combat?.target].filter(Boolean).map(unit => unitMapKey(unit!.playerId, unit!.unitId))
  const overlay = canvas && (tracking?.enabled || replay && tracking) && <>
    <div className="tactical-unit-layer" aria-label="Tactical unit markers">
      <svg className="tactical-position-guides" viewBox={`0 0 ${Math.max(80, canvasSize.width)} ${Math.max(80, canvasSize.height)}`} aria-hidden="true">
        {guides.map(guide => <g key={guide.key} data-unit-anchor={guide.key}>
          <line x1={guide.origin.x} y1={guide.origin.y} x2={guide.icon.x} y2={guide.icon.y} />
          <circle cx={guide.origin.x} cy={guide.origin.y} r="2.5" />
        </g>)}
      </svg>
      {placing && selected && canMove(selected) && <button className="tactical-placement" aria-label={`Place ${selected.name} on map`} onPointerUp={event => placeSelected(event.clientX, event.clientY)} onClick={event => {
        if (event.detail === 0) commit(selected, 'battlefield', view.toSource({ x: Number(coordinates.x) / 100, y: Number(coordinates.y) / 100 }))
      }} onKeyDown={event => { if (event.key === 'Escape') setPlacing(false) }} />}
      {clusters.map(group => {
        const point = layout.get(group.key)!
        return <button key={group.key} className="unit-map-cluster" style={{ left: point.x, top: point.y }} aria-label={`${group.members.length} overlapping units`} aria-expanded={expandedCluster === group.key} onClick={() => { setExpandedCluster(current => current === group.key ? null : group.key); setPlacing(false) }}><span>{group.members.length}</span></button>
      })}
      {renderedTokens.map(token => {
        const position = layout.get(token.key)!
        return <button key={token.key} type="button" className={`unit-map-token${selectedKey === token.key ? ' is-selected' : ''}${combatKeys.includes(token.key) ? ' is-combat' : ''}${token.shocked ? ' is-shocked' : ''}`}
          style={{ left: position.x, top: position.y, '--unit-color': token.color, touchAction: selectedKey === token.key && canMove(token) ? 'none' : 'pan-y' } as CSSProperties}
          aria-label={`${token.name} · ${token.owner} · ${token.models} models${token.shocked ? ' · Battle-shocked' : ''}`}
          aria-pressed={selectedKey === token.key} data-unit-key={token.key} data-player-id={token.playerId} data-unit-id={token.unitId}
          data-board-x={token.position!.x} data-board-y={token.position!.y}
          title={`${token.name} · ${token.owner}`} {...dragHandlers(token)} onClick={() => select(token)}
          onKeyDown={event => {
            if (!canMove(token) || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault()
            const display = view.toDisplay(token.position!)
            const amount = event.shiftKey ? .05 : .01
            commit(token, 'battlefield', view.toSource({ x: clamp(display.x + (event.key === 'ArrowRight' ? amount : event.key === 'ArrowLeft' ? -amount : 0)), y: clamp(display.y + (event.key === 'ArrowDown' ? amount : event.key === 'ArrowUp' ? -amount : 0)) }))
          }}>
          <span className="unit-map-token__icon">{token.short}</span><small className="unit-map-token__models">{token.models}</small>
          {labels && !position.crowded && onBoard.length <= 12 && <span className="unit-map-token__label">{token.name}</span>}
        </button>
      })}
      {preview && <span className="unit-map-preview" style={{ left: `${view.toDisplay(preview.point).x * 100}%`, top: `${view.toDisplay(preview.point).y * 100}%` }}><AppIcon name="army" /></span>}
    </div>
    {combat && <svg className="tactical-combat-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="Recorded combat positions">
      {attackFrom && attackTo && <line data-attack-line="true" x1={attackFrom.x * 1000} y1={attackFrom.y * 1000} x2={attackTo.x * 1000} y2={attackTo.y * 1000} />}
      {attackFrom && <circle cx={attackFrom.x * 1000} cy={attackFrom.y * 1000} r="12" className="combat-attacker" />}
      {attackTo && <circle cx={attackTo.x * 1000} cy={attackTo.y * 1000} r="18" className={combat.eliminated ? 'combat-elimination' : 'combat-target'} />}
    </svg>}
  </>

  return <section className="tactical-workspace" aria-label="Unit Tracking">
    {overlay && createPortal(overlay, canvas!)}
    <div className="tactical-toolbar">
      <strong>Unit Tracking · {tracking?.enabled ? 'on' : 'off'}</strong>
      {!replay && <button disabled={!canConfigure} aria-pressed={Boolean(tracking?.enabled)} onClick={() => dispatch({ type: 'UNIT_TRACKING_CHANGED', payload: { enabled: !tracking?.enabled } })}>{tracking?.enabled ? 'Disable Unit Tracking' : 'Enable Unit Tracking'}</button>}
    </div>
    {!tracking?.enabled && !replay && <p className="context-note">Optional position history. Enable at any time and place only the units you want to track.{shared && !membership?.isHost ? ' The room host can enable tracking.' : ''}</p>}
    {tracking?.enabled && !replay && <small className="context-note">Disabling tracking clears current placements; recorded history is retained.</small>}
    {(tracking?.enabled || replay && tracking) && <>
      <div className="tactical-filters">
        <label>Army view<select aria-label="Army view" value={onlyPlayer} onChange={event => setOnlyPlayer(event.target.value)}><option value="all">All armies</option>{session.setup.players.map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label><input type="checkbox" checked={labels} onChange={event => setLabels(event.target.checked)} /> Unit labels</label>
        <details><summary>Visible armies</summary>{session.setup.players.map(player => <label key={player.id}><input type="checkbox" checked={!hiddenPlayers.includes(player.id)} onChange={() => setHiddenPlayers(current => current.includes(player.id) ? current.filter(id => id !== player.id) : [...current, player.id])} />{player.name}</label>)}</details>
      </div>
      <p className="tactical-hint">Tap to select; drag the selected token. Or choose Move unit, then tap the map. Arrow keys move a focused token; Shift moves faster. Dots mark saved positions when icons are offset to keep objectives clear. Positions do not calculate range, LOS or objective control.</p>
      {combat && <p role="status">Recorded combat · {combat.modelsLost} models lost{combat.eliminated ? ' · unit eliminated' : ''}{!attackFrom || !attackTo ? ' · position data incomplete' : ''}</p>}
      {expanded && <section className="panel tactical-cluster-list" aria-label="Overlapping units"><div className="tactical-toolbar"><strong>{expanded.members.length} overlapping units</strong><button aria-label="Close overlapping units" onClick={() => setExpandedCluster(null)}>×</button></div>{tokens.filter(token => expanded.members.includes(token.key)).map(token => <button key={token.key} aria-pressed={selectedKey === token.key} onClick={() => select(token)}>{token.name} · {token.owner}</button>)}</section>}
      <details className="tactical-tray">
        <summary>Deployment &amp; Reserves <span>{visible.filter(token => token.status === 'unplaced').length} Unplaced · {visible.filter(token => token.status === 'reserves').length} In Reserves</span></summary>
        <div className="tactical-tray__list">{(['unplaced', 'reserves', 'battlefield', 'destroyed'] as const).map(status => <details key={status} open={status === 'unplaced' || status === 'reserves'}><summary>{statusName(status)} · {visible.filter(token => token.status === status).length}</summary>
          {visible.filter(token => token.status === status).map(token => <button key={token.key} type="button" className={`tactical-tray-unit${selectedKey === token.key ? ' is-selected' : ''}`}
            data-tray-unit={token.key} aria-pressed={selectedKey === token.key} {...dragHandlers(token, true)} onClick={() => select(token)}
            style={{ '--unit-color': token.color, touchAction: selectedKey === token.key && canMove(token) ? 'none' : 'pan-y' } as CSSProperties}>
            <span className="tactical-tray-unit__sigil">{token.short}</span><span>{token.name}<small>{token.owner} · {token.models} models</small></span>
          </button>)}
        </details>)}</div>
      </details>
      {selected && <section className="tactical-unit-details panel" aria-label="Selected unit details">
        <div className="tactical-toolbar"><div><strong>{selected.name}</strong><small>{selected.owner} · {statusName(selected.status)} · {selected.models} models{selected.shocked ? ' · Battle-shocked' : ''}</small></div><button aria-label="Close unit details" onClick={() => { setSelectedKey(null); setPlacing(false) }}>×</button></div>
        {selectedDefinition && <details><summary>View unit details</summary><p>{selectedDefinition.points} pts · {selectedDefinition.startingModels} starting models{selectedDefinition.stats?.movement ? ` · M ${selectedDefinition.stats.movement}` : ''}{selectedDefinition.stats?.toughness ? ` · T ${selectedDefinition.stats.toughness}` : ''}{selectedDefinition.stats?.save ? ` · Sv ${selectedDefinition.stats.save}` : ''}</p>{selectedDefinition.abilities.map((ability, index) => <p key={`${ability.name}-${index}`}><strong>{ability.name}</strong>{ability.description ? ` · ${ability.description}` : ''}</p>)}</details>}
        {canMove(selected) ? <>
          <div className="tactical-unit-actions"><button aria-pressed={placing} onPointerUp={event => { if (event.pointerType === 'touch') armPlacement() }} onClick={armPlacement}>Move unit</button>{placing && <button onClick={() => setPlacing(false)}>Cancel move</button>}<button onClick={() => commit(selected, 'reserves', null)}>Return to Reserves</button><button onClick={() => commit(selected, 'unplaced', null)}>Set as Unplaced</button></div>
          <details><summary>Keyboard / coordinate placement</summary><div className="tactical-coordinate-inputs"><label>Map X (%)<input type="number" min="0" max="100" step="1" value={coordinates.x} onChange={event => setCoordinates(current => ({ ...current, x: event.target.value }))} /></label><label>Map Y (%)<input type="number" min="0" max="100" step="1" value={coordinates.y} onChange={event => setCoordinates(current => ({ ...current, y: event.target.value }))} /></label>
          <button disabled={[coordinates.x, coordinates.y].some(value => value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100)} onClick={() => commit(selected, 'battlefield', view.toSource({ x: Number(coordinates.x) / 100, y: Number(coordinates.y) / 100 }))}>Save position</button></div></details>
        </> : <p className="context-note">{replay ? 'Historical unit state · read only' : selected.destroyed ? 'Restore models through Combat Log before placing this unit again.' : 'This army belongs to another commander.'}</p>}
        {selected.position && <button onClick={() => {
          canvas?.scrollIntoView({ block: 'center', behavior: 'smooth' })
          canvas?.querySelector<HTMLButtonElement>(`[data-unit-key='${CSS.escape(selected.key)}']`)?.focus({ preventScroll: true })
        }}>Focus on unit</button>}
      </section>}
      {notice && <p role="status">{notice}</p>}
    </>}
    {replay && !tracking && <p className="context-note">No unit positions were recorded at this point in the battle.</p>}
  </section>
}
