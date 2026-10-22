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
          <span className="eyebrow">Army Library 2.0</span>
          <h1>My Armies</h1>
          <p>
            {owner
              ? 'Your private lists, available offline and across your devices.'
              : 'Your lists on this device. Sign in for optional cloud sync.'}
          </p>
        </div>
        <div className="roster-actions">
          <Link className="button button--gold" to="/army-import">
            Import army
          </Link>
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
            Backup library
          </button>
          <Link className="button" to="/account">
            {owner ? 'My account' : 'Sign in'}
          </Link>
        </div>
      </section>
      {owner && (
        <div className="roster-sync-bar" role="status">
          <span>
            {sync.owner === owner && sync.busy
              ? 'Syncing…'
              : sync.owner === owner && sync.error
                ? 'Sync needs attention — edits are saved on this device.'
                : 'Private cloud library'}
            {sync.owner === owner && sync.lastSync
              ? ` · Last sync ${new Date(sync.lastSync).toLocaleTimeString()}`
              : ''}
          </span>
          <button
            className="button button--small"
            disabled={busy || sync.busy}
            onClick={() => void syncArmies()}
          >
            Sync now
          </button>
        </div>
      )}
      {(error || message || (owner && sync.owner === owner && sync.error)) && (
        <p className="alert alert--warning" role="alert">
          {error || message || sync.error}
        </p>
      )}
      <div className="roster-filters">
        <label>
          Search rosters
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or faction"
          />
        </label>
        <label>
          Faction
          <select value={faction} onChange={(e) => setFaction(e.target.value)}>
            <option value="">All factions</option>
            {[...new Set(rows.map((r) => r.army.faction))].sort().map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Last edited</option>
            <option value="points">Points (highest first)</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {loading ? (
        <p role="status">Loading rosters…</p>
      ) : !filtered.length ? (
        <section className="empty-state">
          <h2>{rows.length ? 'No matching rosters' : 'Build your library'}</h2>
          <p>
            Import a New Recruit roster or a TabletopHelper backup to get
            started.
          </p>
          <Link className="button" to="/army-import">
            Import army
          </Link>
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
                    'No detachment data'}
                </p>
              </div>
              <div className="roster-card-facts">
                <strong>
                  {row.army.totalPoints}
                  {row.army.pointsLimit ? ` / ${row.army.pointsLimit}` : ''} pts
                </strong>
                <span>{row.army.units.length} units</span>
                <span className={`roster-status roster-status--${row.status}`}>
                  {row.status ?? 'local'}
                </span>
              </div>
              <small>
                {row.army.library?.source === 'homebrew'
                  ? 'Homebrew'
                  : row.army.library?.source === 'local-edit'
                    ? 'Local edit'
                    : 'New Recruit'}{' '}
                · {row.army.library?.variantOf ? 'Variant · ' : ''}Edited{' '}
                {new Date(row.savedAt).toLocaleDateString()}
              </small>
              {row.conflictNote && (
                <p className="alert alert--warning">{row.conflictNote}</p>
              )}
              {row.error && <p className="alert alert--warning">{row.error}</p>}
              <div className="roster-actions">
                <Link
                  className="button button--small"
                  to={`/army/${encodeURIComponent(row.id)}`}
                >
                  Open / View
                </Link>
                <Link
                  className="button button--small"
                  to={`/army/${encodeURIComponent(row.id)}/edit`}
                >
                  Edit
                </Link>
                <button
                  className="button button--small"
                  disabled={busy}
                  onClick={() => void act(() => duplicateRoster(row.army))}
                >
                  Duplicate
                </button>
                <Link
                  className="button button--small button--gold"
                  to={`/battle/setup?armyId=${encodeURIComponent(row.id)}`}
                >
                  Use in Battle
                </Link>
                <DeleteRosterButton key={`${owner}:${row.id}`} army={row.army} owner={owner} disabled={busy} />
              </div>
              <details>
                <summary>More actions</summary>
                <div className="roster-actions">
                  <Link
                    className="button button--small"
                    to={`/army/${encodeURIComponent(row.id)}/edit#roster-name`}
                  >
                    Rename
                  </Link>
                  <Link
                    className="button button--small"
                    to={`/army/${encodeURIComponent(row.id)}/appearance`}
                  >
                    Appearance & photos
                  </Link>
                  <button
                    className="button button--small"
                    onClick={() =>
                      downloadJson(
                        exportRosters([row.army]),
                        'TabletopHelper-roster.json',
                      )
                    }
                  >
                    Export
                  </button>
                </div>
              </details>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
