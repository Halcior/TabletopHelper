import { t as tr } from '../features/i18n/locale'
import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useBeforeUnload } from 'react-router-dom'
import type { Army, UnitDefinition } from '../domain/army/types'
import {
  copyRoster,
  copyUnit,
  normalizeRoster,
  rosterWarnings,
} from '../domain/army/roster'
import { getRoster, saveRoster } from '../features/armyLibrary/repository'
import type { StoredArmy } from '../persistence/storage'
import { UnitPortrait, ArmyBanner } from '../features/factionVisuals/components'
import { rosterOwner, useRosterScope } from '../features/armyLibrary/scope'
import { syncArmies } from '../features/armyLibrary/sync'
import { availableDetachments } from '../domain/army/detachments'

export default function ArmyEditor() {
  const { armyId } = useParams(),
    location = useLocation()
  const editing = location.pathname.endsWith('/edit')
  const owner = useRosterScope((s) => s.userId)
  const [loaded, setLoaded] = useState<{
    owner: string | null
    row: StoredArmy
  }>()
  const [draft, setDraft] = useState<Army>(),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const [unitPhotos, setUnitPhotos] = useState<
    [UnitDefinition, UnitDefinition][]
  >([])
  const [dirty, setDirty] = useState(false)
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  useEffect(() => {
    let active = true
    setDraft(undefined)
    setLoaded(undefined)
    setDirty(false)
    setError('')
    setMessage('')
    setUnitPhotos([])
    void getRoster(armyId ?? '', owner)
      .then((row) => {
        if (!active) return
        if (!row) {
          setError('Roster not found for this account or device.')
          return
        }
        setLoaded({ owner, row })
        setDraft(structuredClone(row.army))
      })
      .catch((reason) => {
        if (active) setError(String(reason))
      })
    return () => {
      active = false
    }
  }, [armyId, owner])
  function change(next: Army) {
    setDraft(next)
    setDirty(true)
    setMessage('')
  }
  function updateUnit(
    id: string,
    fn: (unit: UnitDefinition) => UnitDefinition,
  ) {
    if (draft)
      change({
        ...draft,
        units: draft.units.map((u) => (u.id === id ? fn(u) : u)),
      })
  }
  function discard() {
    if (loaded) {
      setDraft(structuredClone(loaded.row.army))
      setDirty(false)
      setUnitPhotos([])
      setError('')
      setMessage('Changes discarded.')
    }
  }
  async function save(asCopy: boolean) {
    if (!draft || !loaded || busy || loaded.owner !== rosterOwner()) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const normalized = normalizeRoster(
        draft,
        draft.library?.source === 'homebrew' ? 'homebrew' : 'local-edit',
      )
      const army = asCopy
        ? copyRoster(normalized, `${normalized.name} — variant`)
        : normalized
      const photoPairs = unitPhotos.flatMap(([from, to]) => {
        const target = army.units[draft.units.findIndex((u) => u.id === to.id)]
        if (!target) return []
        let source = from
        // Resolve a duplicate of an unsaved duplicate to its saved original.
        for (let i = 0; i < unitPhotos.length; i++) {
          const parent = unitPhotos.find(
            ([, copied]) => copied.id === source.id,
          )
          if (!parent) break
          source = parent[0]
        }
        return [[source, target] as [UnitDefinition, UnitDefinition]]
      })
      await saveRoster(army, {
        owner: loaded.owner,
        expectedChangeId: loaded.row.changeId,
        expectExisting: !asCopy,
        photoSource: asCopy ? draft : undefined,
        unitPhotoSource: draft,
        unitPhotos: photoPairs,
      })
      const row = await getRoster(army.id, loaded.owner)
      if (rosterOwner() !== loaded.owner) return
      setDirty(false)
      setUnitPhotos([])
      if (asCopy) {
        setMessage(`Saved new variant: ${army.name}`)
      } else if (row) {
        setLoaded({ owner: loaded.owner, row })
        setDraft(structuredClone(row.army))
        setMessage('Roster saved.')
      }
      void syncArmies()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  if (!draft || !loaded || loaded.owner !== owner)
    return (
      <div className="page-shell">
        <Link to="/armies">{tr("← My Armies")}</Link>
        <p role={error ? 'alert' : 'status'}>{tr(error) || tr('Loading roster…')}</p>
      </div>
    )
  const total = draft.units.reduce((sum, u) => sum + u.points, 0)
  const detachmentOptions = availableDetachments(draft.faction)
  const cancelNavigation = () =>
    !dirty || window.confirm('Discard unsaved roster changes?')
  return (
    <div className="page-shell roster-editor-page">
      <Link
        to="/armies"
        onClick={(e) => {
          if (!cancelNavigation()) e.preventDefault()
        }}
      >
        {tr(" ← My Armies ")}</Link>
      <div className="page-intro">
        <span className="eyebrow">
          {editing ? tr('Army Editor') : tr('Roster overview')}
        </span>
        <h1>{draft.name}</h1>
        <p>
          {draft.faction} · {draft.detachments.map((d) => d.name).join(' · ')}
        </p>
      </div>
      <ArmyBanner army={{ ...draft, totalPoints: total }} />
      <div className="roster-editor-toolbar">
        <strong aria-label={tr("Roster total points")}>
          {total}
          {draft.pointsLimit ? tr(` / ${draft.pointsLimit}`, " / {0}") : ''} {tr(" pts ·")}{' '}
          {draft.units.length} {tr(" units ")}</strong>
        <div className="roster-actions">
          {editing ? (
            <>
              <button
                className="button button--gold"
                disabled={busy || !dirty}
                onClick={() => void save(false)}
              >
                {tr(" Save ")}</button>
              <button
                className="button"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {tr(" Save as copy ")}</button>
              <button
                className="button"
                disabled={busy || !dirty}
                onClick={discard}
              >
                {tr(" Discard changes ")}</button>
            </>
          ) : (
            <>
              <Link
                className="button"
                to={`/army/${encodeURIComponent(draft.id)}/edit`}
              >
                {tr(" Edit roster ")}</Link>
              <Link
                className="button button--gold"
                to={`/battle/setup?armyId=${encodeURIComponent(draft.id)}`}
              >
                {tr(" Use in Battle ")}</Link>
            </>
          )}
        </div>
      </div>
      {message && (
        <p role="status" className="alert">
          {tr(message)}
          {message.startsWith('Saved new variant') && (
            <>
              {' '}
              ·{' '}
              <Link
                to="/armies"
                onClick={(e) => {
                  if (!cancelNavigation()) e.preventDefault()
                }}
              >
                {tr(" Open My Armies ")}</Link>
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="alert alert--danger">
          {tr(error)}
        </p>
      )}
      <details className="roster-warning" open>
        <summary>{tr("Roster checks")}</summary>
        <ul>
          {rosterWarnings({ ...draft, totalPoints: total }).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </details>
      {editing && (
        <section className="panel roster-fields">
          <label>
            {tr(" Roster name ")}<input
              id="roster-name"
              maxLength={250}
              value={draft.name}
              onChange={(e) => change({ ...draft, name: e.target.value })}
            />
          </label>
          <label>
            {tr(" Points limit ")}<input
              type="number"
              min="0"
              max="100000"
              value={draft.pointsLimit ?? ''}
              onChange={(e) =>
                change({
                  ...draft,
                  pointsLimit: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </label>
          <label>
            {tr(" Data source ")}<select
              value={
                draft.library?.source === 'homebrew' ? 'homebrew' : 'local-edit'
              }
              onChange={(e) =>
                change({
                  ...draft,
                  library: {
                    source: e.target.value as 'homebrew' | 'local-edit',
                    createdAt:
                      draft.library?.createdAt ?? new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    variantOf: draft.library?.variantOf,
                  },
                })
              }
            >
              <option value="local-edit">{tr("Imported roster / local edit")}</option>
              <option value="homebrew">{tr("Homebrew")}</option>
            </select>
          </label>
          {detachmentOptions.length > 0 ? (
            <div>
              <strong>{tr("Detachments")}</strong>
              {(draft.detachments.length
                ? draft.detachments
                : [{ id: '', name: 'Choose detachment' }]
              ).map((current, index) => (
                <label key={index}>
                  {tr(" Detachment ")}{index + 1}
                  <select
                    value={current.id}
                    onChange={(e) => {
                      const selected = detachmentOptions.find(
                        (d) => d.id === e.target.value,
                      )
                      if (!selected) return
                      change({
                        ...draft,
                        detachments: draft.detachments.length
                          ? draft.detachments.map((d, i) =>
                              i === index ? selected : d,
                            )
                          : [selected],
                      })
                    }}
                  >
                    <option value={current.id}>{current.name} {tr(" (current)")}</option>
                    {detachmentOptions
                      .filter((d) => d.id !== current.id)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <small>
                {tr(" Names from the bundled community dataset. Verify current edition, unit restrictions and enhancements after changing. ")}</small>
            </div>
          ) : (
            <div>
              <strong>{tr("Detachment")}</strong>
              <p>
                {draft.detachments.map((d) => d.name).join(' · ') ||
                  tr('Not included in this import.')}
              </p>
              <small>
                {tr(" No matching detachment catalogue. Reimport an official change, or label a manual change as Homebrew. ")}</small>
            </div>
          )}
          {draft.library?.source === 'homebrew' && (
            <label>
              {tr(" Homebrew detachment name ")}<input
                value={draft.detachments[0]?.name ?? ''}
                onChange={(e) =>
                  change({
                    ...draft,
                    detachments: e.target.value
                      ? [{ id: 'homebrew', name: e.target.value }]
                      : [],
                  })
                }
              />
            </label>
          )}
        </section>
      )}
      <section className="roster-unit-list" aria-label={tr("Roster units")}>
        {draft.units.map((u, index) => (
          <article className="panel roster-unit" key={u.id}>
            <div className="roster-unit-heading">
              <UnitPortrait army={draft} unit={u} />
              <div>
                <h2>{u.name}</h2>
                <p>
                  {u.startingModels} {tr(" models · ")}{u.points} {tr(" pts ")}{u.editor?.customPoints ? tr(' · Custom points') : ''}
                  {u.isWarlord ? tr(' · Warlord') : ''}
                </p>
              </div>
            </div>
            {editing && (
              <>
                <div className="roster-fields">
                  <label>
                    {tr(" Unit points (custom override) ")}<input
                      type="number"
                      min="0"
                      max="100000"
                      value={u.points}
                      onChange={(e) =>
                        updateUnit(u.id, (current) => ({
                          ...current,
                          points: Number(e.target.value),
                          editor: { ...current.editor, customPoints: true },
                        }))
                      }
                    />
                  </label>
                  <label>
                    {tr(" Leader → Bodyguard ")}<select
                      value={u.leaderOfUnitId ?? ''}
                      onChange={(e) =>
                        updateUnit(u.id, (current) => ({
                          ...current,
                          leaderOfUnitId: e.target.value || null,
                        }))
                      }
                    >
                      <option value="">{tr("Unattached")}</option>
                      {draft.units
                        .filter(
                          (target) =>
                            target.id !== u.id &&
                            !target.leaderOfUnitId &&
                            !u.ledByUnitIds.includes(target.id),
                        )
                        .map((target) => (
                          <option key={target.id} value={target.id}>
                            {target.name} {tr(" (verify eligibility) ")}</option>
                        ))}
                    </select>
                  </label>
                  <label>
                    {tr(" Warlord ")}<input
                      type="checkbox"
                      checked={u.isWarlord}
                      onChange={(e) =>
                        change({
                          ...draft,
                          units: draft.units.map((unit) => ({
                            ...unit,
                            isWarlord: unit.id === u.id && e.target.checked,
                          })),
                        })
                      }
                    />
                  </label>
                </div>
                <details>
                  <summary>{tr("Edit model groups")}</summary>
                  <p className="context-note">
                    {tr(" Manual variant: points and equipment are not automatically adjusted. Verify the allowed unit size and cost. ")}</p>
                  {u.modelGroups.length ? (
                    u.modelGroups.map((g, gi) => (
                      <label key={gi}>
                        {g.name} {tr(" — models ")}<input
                          aria-label={tr(`${g.name} models`, "{0} models")}
                          type="number"
                          min="0"
                          max="1000"
                          value={g.startingCount}
                          onChange={(e) =>
                            updateUnit(u.id, (current) => {
                              const groups = current.modelGroups.map(
                                (group, i) =>
                                  i === gi
                                    ? {
                                        ...group,
                                        startingCount: Number(e.target.value),
                                      }
                                    : group,
                              )
                              return {
                                ...current,
                                modelGroups: groups,
                                startingModels: groups.reduce(
                                  (sum, group) => sum + group.startingCount,
                                  0,
                                ),
                                editor: {
                                  ...current.editor,
                                  changedModels: true,
                                },
                              }
                            })
                          }
                        />
                      </label>
                    ))
                  ) : (
                    <p>
                      {tr(" No per-model profile data in this import; reimport to change model count. ")}</p>
                  )}
                </details>
                <div className="roster-actions">
                  <button
                    className="button button--small"
                    onClick={() => {
                      const unit = copyUnit(u)
                      setUnitPhotos((pairs) => [...pairs, [u, unit]])
                      change({
                        ...draft,
                        units: [
                          ...draft.units.slice(0, index + 1),
                          unit,
                          ...draft.units.slice(index + 1),
                        ],
                      })
                    }}
                  >
                    {tr(" Duplicate unit ")}</button>
                  <button
                    className="button button--small"
                    onClick={() =>
                      change({
                        ...draft,
                        units: draft.units
                          .filter((unit) => unit.id !== u.id)
                          .map((unit) => ({
                            ...unit,
                            leaderOfUnitId:
                              unit.leaderOfUnitId === u.id
                                ? null
                                : unit.leaderOfUnitId,
                            ledByUnitIds: unit.ledByUnitIds.filter(
                              (id) => id !== u.id,
                            ),
                          })),
                      })
                    }
                  >
                    {tr(" Remove unit ")}</button>
                </div>
              </>
            )}
            {!editing && (
              <p>
                {u.leaderOfUnitId
                  ? tr(`Leads: ${draft.units.find((target) => target.id === u.leaderOfUnitId)?.name}`, "Leads: {0}")
                  : u.ledByUnitIds.length
                    ? tr(`Led by: ${u.ledByUnitIds.map((id) => draft.units.find((unit) => unit.id === id)?.name).join(', ')}`, "Led by: {0}")
                    : tr('Unattached')}
              </p>
            )}
            <details>
              <summary>{tr("Profiles, equipment & enhancements")}</summary>
              <p>
                {u.modelGroups
                  .map((g) => `${g.name}: ${g.equipment.join(', ')}`)
                  .join(' · ')}
              </p>
              <p>
                {[...u.rangedWeapons, ...u.meleeWeapons]
                  .map((w) => w.name)
                  .join(' · ')}
              </p>
              {u.enhancements.map((enh, i) => (
                <p key={i}>
                  <strong>
                    {enh.name} · {enh.points} {tr(" pts ")}</strong>{' '}
                  {tr(enh.description)}
                </p>
              ))}
              {u.abilities.map((a, i) => (
                <p key={i}>
                  <strong>{a.name}</strong> {tr(a.description)}
                </p>
              ))}
              <small>
                {tr(" Only the selected loadout is available in this export. Alternative profiles and upgrade prices are not known; reimport a loadout change from New Recruit. ")}</small>
            </details>
          </article>
        ))}
      </section>
    </div>
  )
}
