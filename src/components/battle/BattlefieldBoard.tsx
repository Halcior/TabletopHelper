import { t as tr } from '../../features/i18n/locale'
import { BattlefieldMapSvg, DEFAULT_TERRAIN_LAYERS, TerrainLayerControls, TerrainLegend } from './BattlefieldMapSvg'
import { PlayerFactionMarks } from '../../features/factionVisuals/components'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { CommandPopover } from '../ui/CommandPopover'
import { InfoDisclosure } from '../ui/InfoDisclosure'
import { AppIcon } from '../AppIcon'
import { RulesSourceBadge } from '../ui/RulesSourceBadge'
import { rulesForSession } from '../../rulesets/rulesSource'
import { placeObjectiveLabels } from './objectiveLabels'
import { buildBattleChronicle } from '../../domain/battle/chronicle'
import { doublesScorekeeperId, doublesForceForPlayer } from '../../domain/battle/doubles'
import type { BattleEventInput, BattleSession } from '../../domain/battle/types'
import {
  battlefieldPresentation,
  battlefieldView,
  defaultBattlefieldGeometry,
  objectiveFootprint,
  isOfficialBoard,
  validateBattlefieldGeometry,
} from '../../domain/battlefield/layouts'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import type { BattlefieldGeometry, ObjectiveFootprint } from '../../domain/battlefield/types'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export function BattlefieldBoard({
  session,
  dispatch,
  liveObjectiveIds = [],
  onOpenList,
  replayRequest = 0,
  onEditingChange,
  active = true,
  readOnly = false,
}: {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  liveObjectiveIds?: string[]
  onOpenList?: (objectiveId: string) => void
  replayRequest?: number
  onEditingChange?: (editing: boolean) => void
  active?: boolean
  readOnly?: boolean
}) {
  const membership = useSharedSessionStore((state) => state.membership)
  const shared = membership?.battleId === session.setup.gameId
  const canEdit =
    !readOnly && session.state.status === 'active' && (!shared || membership?.isHost)
  const [rotated, setRotated] = useState(false)
  const [showFootprints, setShowFootprints] = useState(true)
  const [layers, setLayers] = useState(DEFAULT_TERRAIN_LAYERS)
  const [editingFootprintId, setEditingFootprintId] = useState(() => session.setup.objectives[0]?.id ?? '')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BattlefieldGeometry | null>(null)
  const [error, setError] = useState('')
  const [replay, setReplay] = useState(!readOnly && session.state.status !== 'active')
  const [replayIndex, setReplayIndex] = useState<number | null>(null)
  const canvas = useRef<HTMLDivElement>(null)
  const dragging = useRef<string | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const lastReplayRequest = useRef(0)
  useEffect(() => {
    if (replayRequest === lastReplayRequest.current) return
    lastReplayRequest.current = replayRequest
    if (!draft) { setReplay(true); setReplayIndex(null); setSelectedId(null) }
  }, [replayRequest, draft])
  useEffect(() => { onEditingChange?.(Boolean(draft)) }, [Boolean(draft), onEditingChange])
  useEffect(() => { if (!active) setSelectedId(null) }, [active])
  useEffect(() => {
    if (!canvas.current) return
    const observer = new ResizeObserver(([entry]) => setCanvasSize({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(canvas.current)
    return () => observer.disconnect()
  }, [])
  const frames = useMemo(() => buildBattlefieldReplay(session), [session])
  const entries = useMemo(() => buildBattleChronicle(session), [session])
  const frame =
    frames[Math.min(replayIndex ?? frames.length - 1, frames.length - 1)]
  const liveGeometry =
    session.state.battlefield ?? defaultBattlefieldGeometry(session.setup)
  const geometry =
    draft ?? (replay ? frame?.geometry : liveGeometry) ?? liveGeometry
  const renderWidth = Math.max(
    60,
    Math.min(400, Number.isFinite(geometry.widthCm) ? geometry.widthCm : 180),
  )
  const renderHeight = Math.max(
    60,
    Math.min(400, Number.isFinite(geometry.heightCm) ? geometry.heightCm : 120),
  )
  const view = battlefieldView(renderWidth, renderHeight, rotated)
  const presentation = battlefieldPresentation(session.setup, geometry)
  const activeId = replay
    ? (frame?.activePlayerId ?? session.state.activePlayerId)
    : session.state.activePlayerId
  const controllers = replay
    ? (frame?.controllers ?? {})
    : Object.fromEntries(
        Object.values(session.state.objectives).map((objective) => [
          objective.id,
          objective.controllerPlayerId,
        ]),
      )
  const selected = selectedId ? session.state.objectives[selectedId] : undefined
  const playerIndex = (id: string | null | undefined) =>
    id ? session.setup.turnOrder.indexOf(doublesScorekeeperId(session.setup, id)) : -1
  const controllerName = (id: string) =>
    controllers[id]
      ? (doublesForceForPlayer(session.setup, controllers[id]!)?.name ?? session.state.players[controllers[id]!]?.name ?? 'Unknown')
      : 'Uncontrolled'
  const displayedIds = new Set(
    frames
      .slice(1, (replay ? (frame?.index ?? 0) : frames.length - 1) + 1)
      .map((step) => step.eventId),
  )
  const highlightRound = replay ? (frame?.round ?? 1) : session.state.round
  const highlights = entries
    .filter(
      (entry) =>
        displayedIds.has(entry.id) &&
        entry.round === highlightRound &&
        entry.highlight &&
        entry.category !== 'flow',
    )
    .slice(-10)
  const labelPoints = Object.entries(geometry.positions).flatMap(([id, point]) => point ? [{ id, ...view.toDisplay(point), owner: controllers[id] ? controllerName(id) : undefined }] : [])
  const labelLayout = placeObjectiveLabels(labelPoints, canvasSize.width, canvasSize.height)
  const clusteredIds = labelPoints.filter((point) => labelPoints.some((other) => point.id !== other.id && Math.hypot((point.x - other.x) * canvasSize.width, (point.y - other.y) * canvasSize.height) < 44)).map((point) => point.id)
  const legendIds = [...new Set([...labelLayout.overflowIds, ...clusteredIds])]

  function beginEdit() {
    if (!canEdit || replay || isOfficialBoard(session.setup)) return
    setSelectedId(null)
    setDraft({ ...structuredClone(liveGeometry), locked: false })
    setError('')
  }
  function updateFootprint(changes: Partial<ObjectiveFootprint>) {
    if (!draft || !editingFootprintId || draft.locked) return
    setDraft((current) => current ? {
      ...current, footprints: {
        ...current.footprints,
        [editingFootprintId]: { ...objectiveFootprint(current, editingFootprintId), ...changes },
      },
    } : current)
  }
  function saveLayout() {
    if (!draft || !canEdit || replay) return
    try {
      const next = draft
      validateBattlefieldGeometry(session.setup, next)
      dispatch({
        type: 'BATTLEFIELD_LAYOUT_CHANGED',
        payload: { geometry: next },
      })
      setDraft(null)
      setError('')
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    }
  }
  function drag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!draft || draft.locked || dragging.current !== id || !canvas.current)
      return
    const box = canvas.current.getBoundingClientRect()
    const clamp = (value: number) => Math.max(0, Math.min(1, value))
    const point = view.toSource(
      {
        x: clamp((event.clientX - box.left) / box.width),
        y: clamp((event.clientY - box.top) / box.height),
      },
    )
    setDraft((current) =>
      current
        ? { ...current, positions: { ...current.positions, [id]: point } }
        : current,
    )
  }
  function changeController(playerId: string | null) {
    if (readOnly || !selectedId || replay || draft || session.state.status !== 'active')
      return
    dispatch({
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: selectedId, controllerPlayerId: playerId },
    })
    setSelectedId(null)
  }

  return (
    <section className="battlefield-board" aria-label={readOnly ? tr('Battlefield · read only') : tr('Interactive battlefield')}>
      <header className="battlefield-heading">
        <div>
          <span className="eyebrow">
            {readOnly ? tr('Battlefield · read only') : replay
              ? tr('Battle Replay · read only')
              : presentation.official
                ? tr('Official source geometry')
                : tr('Editable table schematic')}
          </span>
          <h3>{tr(presentation.title)}</h3>
          <p>
            {Number(view.widthCm.toFixed(2))} ×{' '}
            {Number(view.heightCm.toFixed(2))} {tr(" cm ")}{presentation.official ? ' · 60″ × 44″' : ''}
          </p>
        </div>
        {!readOnly && <div className="battlefield-tools">
          <button
            aria-pressed={rotated}
            onClick={() => setRotated((current) => !current)}
          >
            {tr(" Rotate 180° ")}</button>
          {!isOfficialBoard(session.setup) && <button type="button"
            aria-pressed={showFootprints}
            onClick={() => setShowFootprints((current) => !current)}
            title={tr("Visual terrain only — does not calculate official area or scoring")}
          >
            {showFootprints ? tr('Hide footprints') : tr('Show footprints')}
          </button>}
          <button
            aria-pressed={replay}
            disabled={Boolean(draft)}
            onClick={() => {
              if (readOnly) return
              setSelectedId(null)
              setReplay((current) => !current)
              setReplayIndex(null)
            }}
          >
            {replay ? tr('Return to live') : tr('Replay')}
          </button>
          {!isOfficialBoard(session.setup) && (
            <button
              disabled={!canEdit || replay || Boolean(draft)}
              onClick={beginEdit}
            >
              {tr(" Edit Layout ")}</button>
          )}
        </div>}
      </header>
      {presentation.official && (
        <InfoDisclosure label={tr("Source & Attacker / Defender")} className="battlefield-source-disclosure"><div className="battlefield-source">
          <a
            href={`${presentation.sourceUrl}#page=${presentation.sourcePage}`}
            target="_blank"
            rel="noreferrer"
          >
            {tr(" Event Companion v")}{presentation.sourceVersion} {tr(" · page")}{' '}
            {presentation.sourcePage}
          </a>
          <label>
            <span>{tr("Attacker HOME assignment")}</span>
            <select
              disabled={!canEdit || replay}
              value={geometry.attackerHomeZone}
              onChange={(event) =>
                dispatch({
                  type: 'BATTLEFIELD_LAYOUT_CHANGED',
                  payload: {
                    geometry: defaultBattlefieldGeometry(
                      session.setup,
                      event.target.value as 'A' | 'B',
                    ),
                  },
                })
              }
            >
              <option value="A">{tr("A-HOME · Attacker / B-HOME · Defender")}</option>
              <option value="B">{tr("B-HOME · Attacker / A-HOME · Defender")}</option>
            </select>
          </label>
          <small>
            {tr(" Match this assignment to the Attacker/Defender roll. Rotation changes only your view. ")}</small>
        </div></InfoDisclosure>
      )}
      {!isOfficialBoard(session.setup) && (
        <InfoDisclosure label={tr("Schematic deployment")}><p className="battlefield-schematic-note">
          {tr(" Deployment shapes are schematic orientation aids. Use your agreed physical deployment and Territory boundaries. ")}</p></InfoDisclosure>
      )}
      {presentation.terrain && <>
        <TerrainLayerControls layers={layers} onChange={setLayers} />
        <TerrainLegend />
        <p className="battlefield-footprint-note">{tr("Event Companion v")}{presentation.sourceVersion} · {session.setup.battlefieldSourceId} {tr(" · page ")}{presentation.sourcePage}{tr(". Diagram-derived geometry; nominal sizes exclude perimeter protrusions.")}</p>
      </>}
      {isOfficialBoard(session.setup) && !presentation.official && <p role="alert" className="battlefield-footprint-note">{tr("The source pinned to this session is unavailable. No replacement map is generated. Consult your saved table plan.")}</p>}
      {presentation.official && !presentation.terrain && <p className="battlefield-footprint-note">{tr("Historical catalogue v1.0 retained. Terrain was not recorded for this battle. Open the layout gallery to inspect the current source without changing this session.")}</p>}
      <div className="battlefield-player-legend">
        {session.setup.players.filter((player) => !session.setup.doubles || session.state.turnOrder.includes(player.id)).map((player) => (
          <span
            key={player.id}
            className={`battlefield-player battlefield-player--${playerIndex(player.id)}${player.id === activeId ? ' is-active' : ''}`}
          >
            <i />
            <PlayerFactionMarks session={session} playerId={player.id} /> {player.deploymentZone} · {doublesForceForPlayer(session.setup, player.id)?.name ?? player.name}
            {player.id === activeId ? tr(' · active') : ''}
          </span>
        ))}
      </div>
      {!readOnly && replay && (
        <section
          className="panel battlefield-replay"
          aria-label={tr("Battle Replay controls")}
        >
          <div className="battlefield-replay__heading">
            <strong>
              {tr(" Round ")}{frame?.round ?? 1} · {frame?.phase.replace('_', ' ')}
            </strong>
            <span>
              {tr(" Event ")}{frame?.index ?? 0} / {frames.length - 1}
            </span>
          </div>
          <label>
            <span>{tr("Replay event")}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              step={1}
              value={frame?.index ?? 0}
              onChange={(event) => {
                setReplayIndex(Number(event.target.value))
                setSelectedId(null)
              }}
            />
          </label>
          <div
            className="battlefield-replay__rounds"
            role="group"
            aria-label={tr("Jump to round")}
          >
            {Array.from(
              { length: session.setup.maxRounds },
              (_, index) => index + 1,
            ).map((round) => {
              const steps = frames.filter((step) => step.round === round)
              return (
                <button
                  key={round}
                  disabled={steps.length === 0}
                  aria-pressed={frame?.round === round}
                  onClick={() => {
              if (readOnly) return
                    setReplayIndex(steps.at(-1)!.index)
                    setSelectedId(null)
                  }}
                >
                  R{round}
                </button>
              )
            })}
          </div>
          <p>{tr(frame?.description)}</p>
          <div className="battlefield-replay__scores">
            {session.setup.players.filter((player) => !session.setup.doubles || session.state.turnOrder.includes(player.id)).map((player) => (
              <span key={player.id}>
                {doublesForceForPlayer(session.setup, player.id)?.name ?? player.name}{' '}
                <strong>{frame?.scores[player.id] ?? 0} {tr(" VP")}</strong>
              </span>
            ))}
          </div>
        </section>
      )}
      {draft && (
        <section
          className="panel battlefield-editor"
          aria-label={tr("FFA Layout Editor")}
        >
          <h4>{tr("Layout Editor")}</h4>
          <p>
            {tr(" Drag objectives, or use arrow keys on a focused marker. Choose an objective to edit its approximate terrain footprint. Host-saved geometry reaches other phones; the footprint visibility toggle is local to this device. ")}</p>
          <div className="battlefield-editor__dimensions">
            <label>
              {tr(" Field width (cm) ")}<input
                type="number"
                min={60}
                max={400}
                value={draft.widthCm}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, widthCm: Number(event.target.value) }
                      : null,
                  )
                }
              />
            </label>
            <label>
              {tr(" Field height (cm) ")}<input
                type="number"
                min={60}
                max={400}
                value={draft.heightCm}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? { ...current, heightCm: Number(event.target.value) }
                      : null,
                  )
                }
              />
            </label>
          </div>
          <div className="battlefield-editor__presets">
            <button
              onClick={() =>
                setDraft((current) =>
                  current
                    ? { ...current, widthCm: 160, heightCm: 120 }
                    : current,
                )
              }
            >
              {tr(" 160 × 120 cm ")}</button>
            <button
              onClick={() =>
                setDraft((current) =>
                  current
                    ? { ...current, widthCm: 180, heightCm: 120 }
                    : current,
                )
              }
            >
              {tr(" 180 × 120 cm ")}</button>
          </div>
          <div className="battlefield-footprint-editor" aria-label={tr("Objective terrain footprint editor")}>
            <h5>{tr("Terrain footprint (visual only)")}</h5>
            <p>{tr("Approximate physical terrain area surrounding an objective. These are not official GW measurements and do not calculate control, OC, LOS or VP.")}</p>
            <label><span>{tr("Objective to configure")}</span>
              <select aria-label={tr("Footprint objective")} value={editingFootprintId} disabled={draft.locked} onChange={(event) => setEditingFootprintId(event.target.value)}>
                {session.setup.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.name}</option>)}
              </select>
            </label>
            <label><span>{tr("Footprint shape")}</span>
              <select aria-label={tr("Footprint shape")} value={objectiveFootprint(draft, editingFootprintId).kind} disabled={draft.locked} onChange={(event) => updateFootprint({ kind: event.target.value as ObjectiveFootprint['kind'] })}>
                <option value="chamfered">{tr("Ruins / clipped corners")}</option>
                <option value="rectangle">{tr("Rectangular terrain")}</option>
              </select>
            </label>
            <div className="battlefield-footprint-editor__dimensions">
              <label><span>{tr("Footprint width (cm)")}</span><input aria-label={tr("Footprint width (cm)")} type="number" min={6} max={60} step={1} disabled={draft.locked}
                value={objectiveFootprint(draft, editingFootprintId).widthCm} onChange={(event) => updateFootprint({ widthCm: Number(event.target.value) })}/></label>
              <label><span>{tr("Footprint height (cm)")}</span><input aria-label={tr("Footprint height (cm)")} type="number" min={6} max={60} step={1} disabled={draft.locked}
                value={objectiveFootprint(draft, editingFootprintId).heightCm} onChange={(event) => updateFootprint({ heightCm: Number(event.target.value) })}/></label>
              <label><span>{tr("Rotation (degrees)")}</span><input aria-label={tr("Footprint rotation")} type="number" min={0} max={359} step={5} disabled={draft.locked}
                value={objectiveFootprint(draft, editingFootprintId).rotation} onChange={(event) => updateFootprint({ rotation: Number(event.target.value) })}/></label>
            </div>
            <div className="battlefield-editor__presets" role="group" aria-label={tr("Footprint size presets")}>
              {([[20, 12], [30, 20], [40, 24]] as const).map(([widthCm, heightCm]) =>
                <button type="button" key={widthCm} disabled={draft.locked} onClick={() => updateFootprint({ widthCm, heightCm })}>{widthCm} × {heightCm} {tr(" cm")}</button>)}
            </div>
          </div>
          <label className="battlefield-editor__lock">
            <input
              type="checkbox"
              checked={draft.locked}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, locked: event.target.checked }
                    : current,
                )
              }
            />
            {tr(" Lock positions ")}</label>
          {error && (
            <p className="alert alert--danger" role="alert">
              {tr(error)}
            </p>
          )}
          <div className="battlefield-editor__actions">
            <button
              onClick={() => {
              if (readOnly) return
                setDraft({
                  ...defaultBattlefieldGeometry(session.setup),
                  locked: false,
                })
                setError('')
              }}
            >
              {tr(" Reset default layout ")}</button>
            <button onClick={() => setDraft(null)}>{tr("Cancel layout edits")}</button>
            <button className="button--gold" onClick={saveLayout}>
              {tr(" Save Layout ")}</button>
          </div>
        </section>
      )}
      <div className={`battlefield-frame${draft ? ' is-editing' : ''}`}>
        <div
          className="battlefield-canvas"
          ref={canvas}
          data-width-cm={geometry.widthCm}
          data-height-cm={geometry.heightCm}
          style={{
            aspectRatio: `${view.widthCm} / ${view.heightCm}`,
          }}
        >
          <BattlefieldMapSvg presentation={presentation} widthCm={renderWidth} heightCm={renderHeight}
            rotated={rotated} layers={{ ...layers, footprints: layers.footprints && showFootprints }}
            zoneColors={Object.fromEntries(session.setup.players.map(player => [player.deploymentZone ?? '', `var(--player-${playerIndex(player.id)})`]))} />
          {!isOfficialBoard(session.setup) && showFootprints && layers.footprints && Object.entries(geometry.positions).flatMap(([id, savedPoint]) => {
            if (!savedPoint) return []
            const point = view.toDisplay(savedPoint)
            const footprint = objectiveFootprint(geometry, id)
            const safeWidth = Math.max(6, Math.min(60, Number.isFinite(footprint.widthCm) ? footprint.widthCm : 30))
            const safeHeight = Math.max(6, Math.min(60, Number.isFinite(footprint.heightCm) ? footprint.heightCm : 20))
            return <div key={id} className={`objective-footprint objective-footprint--${footprint.kind} objective-footprint--player-${playerIndex(controllers[id])}`}
              data-footprint-id={id} data-footprint-kind={footprint.kind} data-footprint-width-cm={footprint.widthCm} data-footprint-height-cm={footprint.heightCm}
              style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, width: `${safeWidth / view.widthCm * 100}%`,
                height: `${safeHeight / view.heightCm * 100}%`, transform: `translate(-50%, -50%) rotate(${view.rotationDeg + (Number.isFinite(footprint.rotation) ? footprint.rotation : 0)}deg)` }}
              aria-hidden="true" />
          })}
          {layers.objectives && Object.entries(geometry.positions).flatMap(([id, savedPoint]) => {
            if (!savedPoint) return []
            const point = view.toDisplay(savedPoint)
            const controller = controllers[id]
            const ownsHome =
              session.setup.players.find(
                (player) => `${player.deploymentZone}-HOME` === id,
              )?.id === activeId
            return (
              <button
                key={id}
                type="button"
                className={`objective-node objective-node--player-${playerIndex(controller)}${ownsHome ? ' is-active-home' : ''}${draft && !draft.locked ? ' is-editing' : ''}${!replay && !draft && liveObjectiveIds.includes(id) ? ' objective-node--live' : ''}`}
                data-objective-id={id}
                data-controller-id={controller ?? 'none'}
                data-board-x={savedPoint.x}
                data-board-y={savedPoint.y}
                style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
                aria-label={tr(`Objective ${id} · ${controllerName(id)}${draft ? ' · drag to move' : ''}`, "Objective {0} · {1}{2}")}
                aria-pressed={selectedId === id}
                onClick={() => {
              if (readOnly) return
                  if (!draft) setSelectedId(id)
                  else if (!draft.locked) setEditingFootprintId(id)
                }}
                onPointerDown={(event) => {
                  if (draft && !draft.locked) {
                    dragging.current = id
                    setEditingFootprintId(id)
                    event.currentTarget.setPointerCapture(event.pointerId)
                    event.preventDefault()
                  }
                }}
                onPointerMove={(event) => drag(event, id)}
                onPointerUp={(event) => {
                  if (dragging.current) {
                    dragging.current = null
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  } else if (!draft && event.pointerType === 'touch') {
                    setSelectedId(id)
                  }
                }}
                onPointerCancel={() => {
                  dragging.current = null
                }}
                onKeyDown={(event) => {
                  if (
                    !draft ||
                    draft.locked ||
                    ![
                      'ArrowUp',
                      'ArrowDown',
                      'ArrowLeft',
                      'ArrowRight',
                    ].includes(event.key)
                  )
                    return
                  event.preventDefault()
                  const deltaX =
                    event.key === 'ArrowLeft'
                      ? -0.01
                      : event.key === 'ArrowRight'
                        ? 0.01
                        : 0
                  const deltaY =
                    event.key === 'ArrowUp'
                      ? -0.01
                      : event.key === 'ArrowDown'
                        ? 0.01
                        : 0
                  const nextPoint = view.toSource({
                    x: Math.max(0, Math.min(1, point.x + deltaX)),
                    y: Math.max(0, Math.min(1, point.y + deltaY)),
                  })
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          positions: {
                            ...current.positions,
                            [id]: nextPoint,
                          },
                        }
                      : current,
                  )
                }}
              >
                <span className="objective-node__symbol" aria-hidden="true">
                  {id.endsWith('-HOME')
                    ? 'H'
                    : id.startsWith('CENTER')
                      ? 'C'
                      : 'N'}
                </span>
              </button>
            )
          })}
          <svg className="objective-label-connectors" viewBox={`0 0 ${canvasSize.width || 1} ${canvasSize.height || 1}`} aria-hidden="true">{labelLayout.labels.map((label) => {
            const point = labelPoints.find((point) => point.id === label.id)!
            return <line key={label.id} x1={point.x * canvasSize.width} y1={point.y * canvasSize.height} x2={label.x + label.width / 2} y2={label.y + label.height / 2} />
          })}</svg>
          {labelLayout.labels.map((label) => <span key={label.id} className={`objective-label objective-label--player-${playerIndex(controllers[label.id])}`} title={tr(`${label.id} · ${controllerName(label.id)}`, "{0} · {1}")} style={{ left: label.x, top: label.y, width: label.width, height: label.height }}><strong>{label.id.replaceAll('-', ' ')}</strong>{controllers[label.id] && <small>{controllerName(label.id)}</small>}</span>)}
        </div>
      </div>
      {legendIds.length > 0 && <div className="battlefield-label-overflow" aria-label={tr("Objectives with labels below the board")}>{legendIds.map((id) => <button key={id} disabled={Boolean(draft)} onClick={() => setSelectedId(id)}>{id}{controllers[id] ? tr(` · ${controllerName(id)}`, " · {0}") : ''}</button>)}</div>}
      {presentation.unplacedIds.length > 0 && (
        <section className="panel battlefield-unplaced">
          <h4>{tr("Saved objectives without a source position")}</h4>
          <p>
            {tr(" This official diagram has")}{' '}
            {Object.values(geometry.positions).filter(Boolean).length} {tr(" physical objectives. The saved battle has ")}{session.setup.objectives.length}{' '}
            {tr(" IDs. These retained IDs have no counterpart in this layout and are shown here without invented coordinates. ")}</p>
          <div>
            {presentation.unplacedIds.map((id) => (
              <button
                key={id}
                data-objective-id={id}
                data-controller-id={controllers[id] ?? 'none'}
                onClick={() => setSelectedId(id)}
              >
                {id} · {controllerName(id)}
              </button>
            ))}
          </div>
        </section>
      )}
      {!isOfficialBoard(session.setup) && showFootprints && <p className="battlefield-footprint-note">{tr("Dashed terrain footprints are schematic visual guides. Objective marker centres and saved control remain independent of terrain areas. Confirm all physical distances and rules at the table.")}</p>}
      <InfoDisclosure label={tr("The physical table decides")}><p className="battlefield-table-note">
        {tr(" The physical table decides LOS, distances, Territory and eligibility. Marker positions do not determine OC or score VP. ")}</p></InfoDisclosure>
      {!readOnly && highlights.length > 0 && (
        <details className="panel battlefield-round-highlights">
          <summary>{tr("Round ")}{highlightRound} {tr(" · recorded highlights")}</summary>
          <ul>
            {highlights.map((entry) => (
              <li key={entry.id}>{tr(entry.description)}</li>
            ))}
          </ul>
        </details>
      )}
      {!canEdit && shared && !replay && (
        <p className="context-note">
          {tr(" Only the room host can edit geometry. Every commander keeps the existing objective-control permissions. ")}</p>
      )}
      {!readOnly && selected && active && <CommandPopover label={tr(`Objective controls for ${selected.id}`, "Objective controls for {0}")} onClose={() => setSelectedId(null)} className="objective-control-popover">
          <section
            className="panel battlefield-objective-sheet"
            aria-label={tr(`Objective controls for ${selected.id}`, "Objective controls for {0}")}
          >
            <div className="battlefield-objective-sheet__heading">
              <span className="objective-control-sigil" aria-hidden="true"><AppIcon name="target" /></span>
              <div>
                <span className="eyebrow">
                  {replay
                    ? tr('Historical control · read only')
                    : tr('Objective control')}
                </span>
                <h4>{selected.name}</h4>
                <small>{controllerName(selected.id)}</small>
              </div>
              <button
                aria-label={tr("Close objective controls")}
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
            <div className="objective-control-meta"><RulesSourceBadge source={rulesForSession(session).source} /><span>{selected.type.toLowerCase().replaceAll('_', ' ')} {tr(" objective · ")}{replay ? tr('Recorded control') : tr('Live control')}</span></div>
            <div className="battlefield-objective-sheet__choices">
              <button
                disabled={replay || session.state.status !== 'active'}
                aria-pressed={!controllers[selected.id]}
                onClick={() => changeController(null)}
              >
                {tr(" None / Uncontrolled ")}</button>
              {session.setup.players.filter((player) => !session.setup.doubles || session.state.turnOrder.includes(player.id)).map((player) => (
                <button
                  disabled={replay || session.state.status !== 'active'}
                  className={`objective-choice--player-${playerIndex(player.id)}`}
                  aria-pressed={controllers[selected.id] === player.id}
                  key={player.id}
                  onClick={() => changeController(player.id)}
                >
                  {player.name}
                </button>
              ))}
            </div>
            {!replay && onOpenList && (
              <button
                className="battlefield-open-oc"
                onClick={() => {
              if (readOnly) return
                  onOpenList(selected.id)
                  setSelectedId(null)
                }}
              >
                {tr(" Open OC Mode ")}</button>
            )}
          </section>
        </CommandPopover>}
    </section>
  )
}
