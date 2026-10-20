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
  defaultBattlefieldGeometry,
  displayBoardPoint,
  validateBattlefieldGeometry,
} from '../../domain/battlefield/layouts'
import { buildBattlefieldReplay } from '../../domain/battlefield/replay'
import type { BattlefieldGeometry } from '../../domain/battlefield/types'
import { useSharedSessionStore } from '../../multiplayer/sharedSessionStore'

export function BattlefieldBoard({
  session,
  dispatch,
  liveObjectiveIds = [],
  onOpenList,
  replayRequest = 0,
  onEditingChange,
  active = true,
}: {
  session: BattleSession
  dispatch: (event: BattleEventInput) => void
  liveObjectiveIds?: string[]
  onOpenList?: (objectiveId: string) => void
  replayRequest?: number
  onEditingChange?: (editing: boolean) => void
  active?: boolean
}) {
  const membership = useSharedSessionStore((state) => state.membership)
  const shared = membership?.battleId === session.setup.gameId
  const canEdit =
    session.state.status === 'active' && (!shared || membership?.isHost)
  const [rotated, setRotated] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<BattlefieldGeometry | null>(null)
  const [error, setError] = useState('')
  const [replay, setReplay] = useState(session.state.status !== 'active')
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
  const labelPoints = Object.entries(geometry.positions).flatMap(([id, point]) => point ? [{ id, ...displayBoardPoint(point, rotated), owner: controllers[id] ? controllerName(id) : undefined }] : [])
  const labelLayout = placeObjectiveLabels(labelPoints, canvasSize.width, canvasSize.height)
  const clusteredIds = labelPoints.filter((point) => labelPoints.some((other) => point.id !== other.id && Math.hypot((point.x - other.x) * canvasSize.width, (point.y - other.y) * canvasSize.height) < 44)).map((point) => point.id)
  const legendIds = [...new Set([...labelLayout.overflowIds, ...clusteredIds])]

  function beginEdit() {
    if (!canEdit || replay || presentation.official) return
    setSelectedId(null)
    setDraft({ ...structuredClone(liveGeometry), locked: false })
    setError('')
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
    const point = displayBoardPoint(
      {
        x: clamp((event.clientX - box.left) / box.width),
        y: clamp((event.clientY - box.top) / box.height),
      },
      rotated,
    )
    setDraft((current) =>
      current
        ? { ...current, positions: { ...current.positions, [id]: point } }
        : current,
    )
  }
  function changeController(playerId: string | null) {
    if (!selectedId || replay || draft || session.state.status !== 'active')
      return
    dispatch({
      type: 'OBJECTIVE_CONTROL_CHANGED',
      payload: { objectiveId: selectedId, controllerPlayerId: playerId },
    })
    setSelectedId(null)
  }

  return (
    <section className="battlefield-board" aria-label="Interactive battlefield">
      <header className="battlefield-heading">
        <div>
          <span className="eyebrow">
            {replay
              ? 'Battle Replay · read only'
              : presentation.official
                ? 'Official source geometry'
                : 'Editable table schematic'}
          </span>
          <h3>{presentation.title}</h3>
          <p>
            {Number(geometry.widthCm.toFixed(2))} ×{' '}
            {Number(geometry.heightCm.toFixed(2))} cm
            {presentation.official ? ' · 44″ × 60″' : ''}
          </p>
        </div>
        <div className="battlefield-tools">
          <button
            aria-pressed={rotated}
            onClick={() => setRotated((current) => !current)}
          >
            Rotate 180°
          </button>
          <button
            aria-pressed={replay}
            disabled={Boolean(draft)}
            onClick={() => {
              setSelectedId(null)
              setReplay((current) => !current)
              setReplayIndex(null)
            }}
          >
            {replay ? 'Return to live' : 'Replay'}
          </button>
          {!presentation.official && (
            <button
              disabled={!canEdit || replay || Boolean(draft)}
              onClick={beginEdit}
            >
              Edit Layout
            </button>
          )}
        </div>
      </header>
      {presentation.official && (
        <InfoDisclosure label="Source & Attacker / Defender" className="battlefield-source-disclosure"><div className="battlefield-source">
          <a
            href={`${presentation.sourceUrl}#page=${presentation.sourcePage}`}
            target="_blank"
            rel="noreferrer"
          >
            Event Companion v{presentation.sourceVersion} · page{' '}
            {presentation.sourcePage}
          </a>
          <label>
            <span>Attacker HOME assignment</span>
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
              <option value="A">A-HOME · Attacker / B-HOME · Defender</option>
              <option value="B">B-HOME · Attacker / A-HOME · Defender</option>
            </select>
          </label>
          <small>
            Match this assignment to the Attacker/Defender roll. Rotation
            changes only your view.
          </small>
        </div></InfoDisclosure>
      )}
      {!presentation.official && (
        <InfoDisclosure label="Schematic deployment"><p className="battlefield-schematic-note">
          Deployment shapes are schematic orientation aids. Use your agreed
          physical deployment and Territory boundaries.
        </p></InfoDisclosure>
      )}
      <div className="battlefield-player-legend">
        {session.setup.players.filter((player) => !session.setup.doubles || session.state.turnOrder.includes(player.id)).map((player) => (
          <span
            key={player.id}
            className={`battlefield-player battlefield-player--${playerIndex(player.id)}${player.id === activeId ? ' is-active' : ''}`}
          >
            <i />
            {player.deploymentZone} · {doublesForceForPlayer(session.setup, player.id)?.name ?? player.name}
            {player.id === activeId ? ' · active' : ''}
          </span>
        ))}
      </div>
      {replay && (
        <section
          className="panel battlefield-replay"
          aria-label="Battle Replay controls"
        >
          <div className="battlefield-replay__heading">
            <strong>
              Round {frame?.round ?? 1} · {frame?.phase.replace('_', ' ')}
            </strong>
            <span>
              Event {frame?.index ?? 0} / {frames.length - 1}
            </span>
          </div>
          <label>
            <span>Replay event</span>
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
            aria-label="Jump to round"
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
                    setReplayIndex(steps.at(-1)!.index)
                    setSelectedId(null)
                  }}
                >
                  R{round}
                </button>
              )
            })}
          </div>
          <p>{frame?.description}</p>
          <div className="battlefield-replay__scores">
            {session.setup.players.filter((player) => !session.setup.doubles || session.state.turnOrder.includes(player.id)).map((player) => (
              <span key={player.id}>
                {doublesForceForPlayer(session.setup, player.id)?.name ?? player.name}{' '}
                <strong>{frame?.scores[player.id] ?? 0} VP</strong>
              </span>
            ))}
          </div>
        </section>
      )}
      {draft && (
        <section
          className="panel battlefield-editor"
          aria-label="FFA Layout Editor"
        >
          <h4>Layout Editor</h4>
          <p>
            Drag objectives, or use arrow keys on a focused marker. Changes
            reach other phones when saved.
          </p>
          <div className="battlefield-editor__dimensions">
            <label>
              Field width (cm)
              <input
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
              Field height (cm)
              <input
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
              160 × 120 cm
            </button>
            <button
              onClick={() =>
                setDraft((current) =>
                  current
                    ? { ...current, widthCm: 180, heightCm: 120 }
                    : current,
                )
              }
            >
              180 × 120 cm
            </button>
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
            Lock positions
          </label>
          {error && (
            <p className="alert alert--danger" role="alert">
              {error}
            </p>
          )}
          <div className="battlefield-editor__actions">
            <button
              onClick={() => {
                setDraft({
                  ...defaultBattlefieldGeometry(session.setup),
                  locked: false,
                })
                setError('')
              }}
            >
              Reset default layout
            </button>
            <button onClick={() => setDraft(null)}>Cancel layout edits</button>
            <button className="button--gold" onClick={saveLayout}>
              Save Layout
            </button>
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
            aspectRatio: `${renderWidth} / ${renderHeight}`,
          }}
        >
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <pattern
                id={`battlefield-grid-${session.setup.gameId}`}
                width={10 / renderWidth}
                height={10 / renderHeight}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${10 / renderWidth} 0 L 0 0 L 0 ${10 / renderHeight}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.0008"
                />
              </pattern>
            </defs>
            <rect
              width="1"
              height="1"
              fill={`url(#battlefield-grid-${session.setup.gameId})`}
            />
            <g transform={rotated ? 'rotate(180 .5 .5)' : undefined}>
              {presentation.deploymentAreas.map((area) => {
                const player = session.setup.players.find(
                  (player) => player.deploymentZone === area.zone,
                )
                return (
                  <path
                    key={area.zone}
                    d={area.path}
                    data-deployment-zone={area.zone}
                    fill={`var(--player-${playerIndex(player?.id)})`}
                    fillOpacity=".16"
                    stroke={`var(--player-${playerIndex(player?.id)})`}
                    strokeOpacity=".6"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )
              })}
              {presentation.territoryPaths.map((path, index) => (
                <path
                  key={index}
                  d={path}
                  className="battlefield-territory"
                  fill="none"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          </svg>
          {Object.entries(geometry.positions).flatMap(([id, savedPoint]) => {
            if (!savedPoint) return []
            const point = displayBoardPoint(savedPoint, rotated)
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
                aria-label={`Objective ${id} · ${controllerName(id)}${draft ? ' · drag to move' : ''}`}
                aria-pressed={selectedId === id}
                onClick={() => {
                  if (!draft) setSelectedId(id)
                }}
                onPointerDown={(event) => {
                  if (draft && !draft.locked) {
                    dragging.current = id
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
                  const direction = rotated ? -1 : 1
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          positions: {
                            ...current.positions,
                            [id]: {
                              x: Math.max(
                                0,
                                Math.min(1, savedPoint.x + deltaX * direction),
                              ),
                              y: Math.max(
                                0,
                                Math.min(1, savedPoint.y + deltaY * direction),
                              ),
                            },
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
          {labelLayout.labels.map((label) => <span key={label.id} className={`objective-label objective-label--player-${playerIndex(controllers[label.id])}`} title={`${label.id} · ${controllerName(label.id)}`} style={{ left: label.x, top: label.y, width: label.width, height: label.height }}><strong>{label.id.replaceAll('-', ' ')}</strong>{controllers[label.id] && <small>{controllerName(label.id)}</small>}</span>)}
        </div>
      </div>
      {legendIds.length > 0 && <div className="battlefield-label-overflow" aria-label="Objectives with labels below the board">{legendIds.map((id) => <button key={id} disabled={Boolean(draft)} onClick={() => setSelectedId(id)}>{id}{controllers[id] ? ` · ${controllerName(id)}` : ''}</button>)}</div>}
      {presentation.unplacedIds.length > 0 && (
        <section className="panel battlefield-unplaced">
          <h4>Saved objectives without a source position</h4>
          <p>
            This official diagram has{' '}
            {Object.values(geometry.positions).filter(Boolean).length} physical
            objectives. The saved battle has {session.setup.objectives.length}{' '}
            IDs. These retained IDs have no counterpart in this layout and are
            shown here without invented coordinates.
          </p>
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
      <InfoDisclosure label="The physical table decides"><p className="battlefield-table-note">
        The physical table decides LOS, distances, Territory and eligibility.
        Marker positions do not determine OC or score VP.
      </p></InfoDisclosure>
      {highlights.length > 0 && (
        <details className="panel battlefield-round-highlights">
          <summary>Round {highlightRound} · recorded highlights</summary>
          <ul>
            {highlights.map((entry) => (
              <li key={entry.id}>{entry.description}</li>
            ))}
          </ul>
        </details>
      )}
      {!canEdit && shared && !replay && (
        <p className="context-note">
          Only the room host can edit geometry. Every commander keeps the
          existing objective-control permissions.
        </p>
      )}
      {selected && active && <CommandPopover label={`Objective controls for ${selected.id}`} onClose={() => setSelectedId(null)} className="objective-control-popover">
          <section
            className="panel battlefield-objective-sheet"
            aria-label={`Objective controls for ${selected.id}`}
          >
            <div className="battlefield-objective-sheet__heading">
              <span className="objective-control-sigil" aria-hidden="true"><AppIcon name="target" /></span>
              <div>
                <span className="eyebrow">
                  {replay
                    ? 'Historical control · read only'
                    : 'Objective control'}
                </span>
                <h4>{selected.name}</h4>
                <small>{controllerName(selected.id)}</small>
              </div>
              <button
                aria-label="Close objective controls"
                onClick={() => setSelectedId(null)}
              >
                ×
              </button>
            </div>
            <div className="objective-control-meta"><RulesSourceBadge source={rulesForSession(session).source} /><span>{selected.type.toLowerCase().replaceAll('_', ' ')} objective · {replay ? 'Recorded control' : 'Live control'}</span></div>
            <div className="battlefield-objective-sheet__choices">
              <button
                disabled={replay || session.state.status !== 'active'}
                aria-pressed={!controllers[selected.id]}
                onClick={() => changeController(null)}
              >
                None / Uncontrolled
              </button>
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
                  onOpenList(selected.id)
                  setSelectedId(null)
                }}
              >
                Open OC Mode
              </button>
            )}
          </section>
        </CommandPopover>}
    </section>
  )
}
