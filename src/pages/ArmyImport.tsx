import { useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { NewRecruitImporter, type ImportResult } from '../importers/newRecruit'
import { saveArmy } from '../persistence/database'

export default function ArmyImport() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setError(null)
    setPreview(null)
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const raw: unknown = JSON.parse(await file.text())
      setPreview(NewRecruitImporter.import(raw))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function acceptArmy() {
    if (!preview) return
    setSaving(true)
    setError(null)
    try {
      await saveArmy(preview.army)
      navigate(`/battle/setup?armyId=${encodeURIComponent(preview.army.id)}`)
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
      setSaving(false)
    }
  }

  const unitNames = new Map(preview?.army.units.map((unit) => [unit.id, unit.name]) ?? [])
  return (
    <div className="page-shell narrow-page">
      <section className="page-intro">
        <span className="eyebrow">Roster adapter</span>
        <h1>Import New Recruit</h1>
        <p>Select the original New Recruit JSON export. The source file remains untouched; the app converts it into its own battle-ready domain model.</p>
      </section>

      <label className="file-drop">
        <span>Choose New Recruit JSON</span>
        <small>JSON files remain on this device.</small>
        <input type="file" accept=".json,application/json" onChange={handleFile} />
      </label>
      {error && <div className="alert alert--danger">{error}</div>}

      {preview && (
        <section className="panel import-preview">
          <div className="import-preview__hero">
            <div><span className="eyebrow">Validated roster</span><h2>{preview.army.faction}</h2><p>{preview.army.name}</p></div>
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
                  {unit.leaderOfUnitId && <span>Leads: {unitNames.get(unit.leaderOfUnitId) ?? unit.leaderOfUnitId}</span>}
                  {unit.ledByUnitIds.length > 0 && <span>Led by: {unit.ledByUnitIds.map((id) => unitNames.get(id) ?? id).join(', ')}</span>}
                </div>
                <strong>{unit.points} pts</strong>
              </article>
            ))}
          </div>
          <button className="button button--gold button--wide" disabled={saving} onClick={() => void acceptArmy()}>{saving ? 'Saving…' : 'Use this army'}</button>
        </section>
      )}
    </div>
  )
}
