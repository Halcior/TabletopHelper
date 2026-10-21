import { useState, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Army } from '../domain/army/types'
import { NewRecruitImporter, type ImportResult } from '../importers/newRecruit'
import { importArmy } from '../features/armyLibrary/repository'
import { importRosters } from '../domain/army/roster'
import { useRosterScope } from '../features/armyLibrary/scope'
import { useEffect } from 'react'
import { syncArmies } from '../features/armyLibrary/sync'

export default function ArmyImport() {
  const owner = useRosterScope(s => s.userId)
  const [backup, setBackup] = useState<Army[]>([])
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Army | null>(null)
  const [savedThisVisit, setSavedThisVisit] = useState<Army[]>([])

  useEffect(() => { setPreview(null); setBackup([]); setLastSaved(null); setSavedThisVisit([]) }, [owner])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const capturedOwner = owner
    const file = event.currentTarget.files?.[0]
    // Browsers otherwise ignore choosing the same filename again, even when
    // the New Recruit export has been updated since the previous import.
    event.currentTarget.value = ''
    if (!file) return
    setError(null)
    setPreview(null)
    setLastSaved(null)
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 20 MB.')
      const raw: unknown = JSON.parse(await file.text())
      if (useRosterScope.getState().userId !== capturedOwner) throw new Error('Account changed. Choose the file again to import it to the new account.')
      const rosters = importRosters(raw)
      if (rosters) { setBackup(rosters); return }
      setBackup([])
      setPreview(NewRecruitImporter.import(raw))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function acceptArmy() {
    if (!preview || saving) return
    setSaving(true)
    setError(null)
    try {
      const army = await importArmy(preview.army)
      void syncArmies()
      setSavedThisVisit((current) => [army, ...current.filter((entry) => entry.id !== army.id)])
      setLastSaved(army)
      setPreview(null)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const unitNames = new Map(preview?.army.units.map((unit) => [unit.id, unit.name]) ?? [])
  const attachedUnitName = (id: string) => unitNames.get(id) ?? 'Unknown attached unit'
  return (
    <div className="page-shell narrow-page">
      <section className="page-intro">
        <span className="eyebrow">Army Library</span>
        <h1>Import New Recruit</h1>
        <Link to="/armies">My Armies →</Link>
        <p>Choose a New Recruit JSON export and review your roster before saving. Import as many armies as you need without leaving this page, then set up your battle.</p>
      </section>

      <label className="file-drop">
        <span>{savedThisVisit.length > 0 ? 'Choose another New Recruit JSON' : 'Choose New Recruit JSON'}</span>
        <small>New Recruit or TabletopHelper JSON. Photos stay on this device.</small>
        <input type="file" accept=".json,application/json" onChange={(event) => void handleFile(event)} disabled={saving} />
      </label>
      {error && <div className="alert alert--danger" role="alert">{error}</div>}

      {lastSaved && !preview && (
        <section className="panel import-saved" role="status" aria-label="Army saved">
          <div>
            <span className="eyebrow">Saved to Army Library</span>
            <h2>{lastSaved.name}</h2>
            <p>{lastSaved.faction} · {lastSaved.totalPoints} pts. Choose another JSON above or create a battle with your saved rosters.</p>
          </div>
          <div className="import-saved__actions">
            <Link className="button button--gold" to="/battle/setup">Create battle</Link>
            <Link className="button" to="/armies">View Army Library</Link>
          </div>
        </section>
      )}

      {backup.length > 0 && <section className="panel" aria-label="Restore library backup"><h2>TabletopHelper backup · {backup.length} rosters</h2><p>Matching IDs and unchanged data are skipped; changed records are saved as independent variants.</p><button className="button button--gold" disabled={saving} onClick={() => {
        setSaving(true); setError(null)
        const capturedOwner = owner
        void (async () => {
          try {
            const restored: Army[] = []
            for (const army of backup) { if (useRosterScope.getState().userId !== capturedOwner) throw new Error('Account changed. Import paused safely.'); restored.push(await importArmy(army)) }
            setSavedThisVisit(current => [...restored, ...current.filter(row => !restored.some(army => army.id === row.id))]); setBackup([]); setLastSaved(restored.at(-1) ?? null); void syncArmies()
          } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) } finally { setSaving(false) }
        })()
      }}>Restore rosters</button></section>}
      {preview && (
        <section className="panel import-preview">
          <div className="import-preview__hero">
            <div><span className="eyebrow">Imported roster</span><h2>{preview.army.faction}</h2><p>{preview.army.name}</p></div>
            <div className="roster-totals"><strong>{preview.army.totalPoints}</strong><span>PTS</span><strong>{preview.army.units.length}</strong><span>UNITS</span></div>
          </div>
          {preview.warnings.length > 0 && (
            <div className="alert alert--warning"><strong>Import warnings</strong><ul>
              {preview.warnings.map((warning) => <li key={`${warning.code}-${warning.selectionId ?? warning.message}`}>{warning.message}</li>)}
            </ul></div>
          )}
          <div className="preview-unit-list">
            {preview.army.units.map((unit) => (
              <article key={unit.id}>
                <div><strong>{unit.name}</strong><span>{unit.startingModels} {unit.startingModels === 1 ? 'model' : 'models'}{unit.isWarlord ? ' · Warlord' : ''}</span>
                  {unit.leaderOfUnitId && <span>Leads: {attachedUnitName(unit.leaderOfUnitId)}</span>}
                  {unit.ledByUnitIds.length > 0 && <span>Led by: {unit.ledByUnitIds.map(attachedUnitName).join(', ')}</span>}
                </div>
                <strong>{unit.points} pts</strong>
              </article>
            ))}
          </div>
          <button className="button button--gold button--wide" disabled={saving} onClick={() => void acceptArmy()}>{saving ? 'Saving…' : 'Save army'}</button>
        </section>
      )}

      {savedThisVisit.length > 0 && (
        <section className="panel import-session-list" aria-label="Armies imported this visit">
          <div className="import-session-list__heading">
            <div><span className="eyebrow">Army Library</span><h2>Imported this visit ({savedThisVisit.length})</h2></div>
            <Link className="button button--small" to="/battle/setup">Create battle</Link>
          </div>
          <ul className="import-session-list__items">
            {savedThisVisit.map((army) => (
              <li key={army.id}>
                <div><strong>{army.name}</strong><span>{army.faction} · {army.totalPoints} pts · {army.units.length} units</span></div>
                <Link className="button button--small" to={`/battle/setup?armyId=${encodeURIComponent(army.id)}`}>Use</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
