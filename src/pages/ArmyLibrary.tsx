import { t as tr } from '../features/i18n/locale'
import { useRemote } from '../features/social/hooks'
import { social } from '../features/social/api'
import { VisibilityControl, type VisibilityMap } from '../features/social/VisibilityControl'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArmyBanner } from '../features/factionVisuals/components'
import {
  duplicateRoster,
  useRosterLibrary,
} from '../features/armyLibrary/repository'
import { exportRosters } from '../domain/army/roster'
import { downloadJson } from '../features/armyLibrary/download'
import { useRosterScope } from '../features/armyLibrary/scope'
import { syncArmies, useSyncState } from '../features/armyLibrary/sync'
import { DeleteRosterButton } from '../features/armyLibrary/DeleteRosterButton'

export default function ArmyLibrary() {
  const { rows, loading, error } = useRosterLibrary()
  const owner = useRosterScope((s) => s.userId)
  const sharing = useRemote(() => owner ? social<VisibilityMap>(owner, 'visibility-list') : Promise.resolve({}), [owner])
  const sync = useSyncState()
  const [query, setQuery] = useState(''),
    [faction, setFaction] = useState(''),
    [sort, setSort] = useState('recent')
  const [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  const filtered = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            (!faction || r.army.faction === faction) &&
            `${r.army.name} ${r.army.faction}`
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === 'points'
            ? b.army.totalPoints - a.army.totalPoints
            : sort === 'name'
              ? a.army.name.localeCompare(b.army.name)
              : b.savedAt.localeCompare(a.savedAt),
        ),
    [rows, query, faction, sort],
  )
  async function act(action: () => Promise<unknown>) {
    setBusy(true)
    setMessage('')
    try {
      await action()
      void syncArmies()
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page-shell roster-library-page">
      <section className="page-intro roster-heading">
        <div>
          <span className="eyebrow">{tr("Army Library 2.0")}</span>
          <h1>{tr("My Armies")}</h1>
          <p>
            {owner
              ? tr('Your lists, available offline and across your devices. Share selected rosters with friends.')
              : tr('Your lists on this device. Sign in for optional cloud sync.')}
          </p>
        </div>
        <div className="roster-actions">
          <Link className="button button--gold" to="/army-import">
            {tr(" Import army ")}</Link>
          <button
            className="button"
            disabled={!rows.length}
            onClick={() =>
              downloadJson(
                exportRosters(rows.map((r) => r.army)),
                'TabletopHelper-library-backup.json',
              )
            }
          >
            {tr(" Backup library ")}</button>
          <Link className="button" to="/account">
            {owner ? tr('My account') : tr('Sign in')}
          </Link>
        </div>
      </section>
      {owner && (
        <div className="roster-sync-bar" role="status">
          <span>
            {sync.owner === owner && sync.busy
              ? tr('Syncing…')
              : sync.owner === owner && sync.error
                ? tr('Sync needs attention — edits are saved on this device.')
                : tr('Private cloud library')}
            {sync.owner === owner && sync.lastSync
              ? tr(` · Last sync ${new Date(sync.lastSync).toLocaleTimeString()}`, " · Last sync {0}")
              : ''}
          </span>
          <button
            className="button button--small"
            disabled={busy || sync.busy}
            onClick={() => void syncArmies()}
          >
            {tr(" Sync now ")}</button>
        </div>
      )}
      {(error || message || (owner && sync.owner === owner && sync.error)) && (
        <p className="alert alert--warning" role="alert">
          {tr(error) || tr(message) || tr(sync.error)}
        </p>
      )}
      {owner && sharing.error && <p role="alert" className="alert">{tr("Sharing unavailable: ")}{tr(sharing.error)}</p>}
      <div className="roster-filters">
        <label>
          {tr(" Search rosters ")}<input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Name or faction")}
          />
        </label>
        <label>
          {tr(" Faction ")}<select value={faction} onChange={(e) => setFaction(e.target.value)}>
            <option value="">{tr("All factions")}</option>
            {[...new Set(rows.map((r) => r.army.faction))].sort().map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          {tr(" Sort by ")}<select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">{tr("Last edited")}</option>
            <option value="points">{tr("Points (highest first)")}</option>
            <option value="name">{tr("Name")}</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status">{tr("Loading rosters…")}</p>
      ) : !filtered.length ? (
        <section className="empty-state">
          <h2>{rows.length ? tr('No matching rosters') : tr('Build your library')}</h2>
          <p>
            {tr(" Import a New Recruit roster or a TabletopHelper backup to get started. ")}</p>
          <Link className="button" to="/army-import">
            {tr(" Import army ")}</Link>
        </section>
      ) : (
        <div className="army-library roster-card-grid">
          {filtered.map((row) => (
            <article className="panel library-card" key={row.id}>
              <ArmyBanner army={row.army} />
              <div>
                <h2>{row.army.name}</h2>
                <p>{row.army.faction}</p>
                <p>
                  {row.army.detachments.map((d) => d.name).join(' · ') ||
                    tr('No detachment data')}
                </p>
              </div>
              <div className="roster-card-facts">
                <strong>
                  {row.army.totalPoints}
                  {row.army.pointsLimit ? tr(` / ${row.army.pointsLimit}`, " / {0}") : ''} {tr(" pts ")}</strong>
                <span>{row.army.units.length} {tr(" units")}</span>
                <span className={`roster-status roster-status--${row.status}`}>
                  {row.status ?? tr('local')}
                </span>
              </div>
              <small>
                {row.army.library?.source === 'homebrew'
                  ? tr('Homebrew')
                  : row.army.library?.source === 'local-edit'
                    ? tr('Local edit')
                    : tr('New Recruit')}{' '}
                · {row.army.library?.variantOf ? tr('Variant · ') : ''}{tr("Edited")}{' '}
                {new Date(row.savedAt).toLocaleDateString()}
              </small>
              {row.conflictNote && (
                <p className="alert alert--warning">{row.conflictNote}</p>
              )}
              {row.error && <p className="alert alert--warning">{tr(row.error)}</p>}
              <div className="roster-actions">
                <Link className="button button--small" to={`/army/${encodeURIComponent(row.id)}/companion`}>Battle Companion</Link>
                <Link
                  className="button button--small"
                  to={`/army/${encodeURIComponent(row.id)}`}
                >
                  {tr(" Open / View ")}</Link>
                <Link
                  className="button button--small"
                  to={`/army/${encodeURIComponent(row.id)}/edit`}
                >
                  {tr(" Edit ")}</Link>
                <button
                  className="button button--small"
                  disabled={busy}
                  onClick={() => void act(() => duplicateRoster(row.army))}
                >
                  {tr(" Duplicate ")}</button>
                <Link
                  className="button button--small button--gold"
                  to={`/battle/setup?armyId=${encodeURIComponent(row.id)}`}
                >
                  {tr(" Use in Battle ")}</Link>
                <DeleteRosterButton key={`${owner}:${row.id}`} army={row.army} owner={owner} disabled={busy} />
              </div>
              {owner && <VisibilityControl key={`${owner}:${row.id}`} owner={owner} armyId={row.id} visibility={sharing.data} refresh={sharing.refresh} />}
              {!owner && <span>{tr("Visibility: Private · local only")}</span>}
              <details>
                <summary>{tr("More actions")}</summary>
                <div className="roster-actions">
                  <Link
                    className="button button--small"
                    to={`/army/${encodeURIComponent(row.id)}/edit#roster-name`}
                  >
                    {tr(" Rename ")}</Link>
                  <Link
                    className="button button--small"
                    to={`/army/${encodeURIComponent(row.id)}/appearance`}
                  >
                    {tr(" Appearance & photos ")}</Link>
                  <button
                    className="button button--small"
                    onClick={() =>
                      downloadJson(
                        exportRosters([row.army]),
                        'TabletopHelper-roster.json',
                      )
                    }
                  >
                    {tr(" Export ")}</button>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
