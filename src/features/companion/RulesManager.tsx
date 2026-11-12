import { useState } from 'react'
import { t } from '../i18n/locale'
import { FILES, EXPORT_BASE, importRules, type ExportFile, type RulesBundle } from './data'
import { downloadRules, saveBundle } from './cache'

export function RulesManager({ bundles, selectedId, onImported, onSelect, canSelect = true }: {
  bundles: RulesBundle[]; selectedId?: string; onImported: (bundle: RulesBundle) => void
  onSelect: (bundle: RulesBundle) => Promise<void>; canSelect?: boolean
}) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [candidate, setCandidate] = useState(selectedId ?? '')
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage('')
    try { await work() } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  async function accept(bundle: RulesBundle) { await saveBundle(bundle); onImported(bundle); setCandidate(bundle.id); setMessage(t('Imported. Select this snapshot to use it.')) }
  return <details className="companion-source" open={!selectedId}>
    <summary>{t('Rules data & updates')} · Wahapedia 11</summary>
    <p>{t('Import date does not prove that rules are current. Updates never replace the snapshot selected for a battle automatically.')}</p>
    <div className="companion-actions">
      <button disabled={busy} onClick={() => void run(async () => accept(await downloadRules(setMessage)))}>{t('Download Wahapedia CSV')}</button>
      <label className="button">{t('Import CSV files')}<input type="file" multiple accept=".csv" disabled={busy} onChange={event => {
        const files = Array.from(event.target.files ?? []); event.target.value = ''
        void run(async () => {
          if (files.reduce((sum, file) => sum + file.size, 0) > 30_000_000) throw new Error('CSV selection exceeds 30 MB.')
          const recognized = files.filter(file => Object.hasOwn(FILES, file.name))
          if (new Set(recognized.map(file => file.name)).size !== recognized.length) throw new Error('Duplicate filenames in import.')
          const input = Object.fromEntries(await Promise.all(recognized.map(async file => [file.name, await file.text()]))) as Partial<Record<ExportFile, string>>
          await accept(await importRules(input))
        })
      }} /></label>
    </div>
    <p aria-live="polite">{busy ? `${t('Working…')} ` : ''}{message}</p>
    <label>{t('Available snapshots')}<select value={candidate} onChange={event => setCandidate(event.target.value)}>
      <option value="">{t('Choose rules data')}</option>
      {bundles.map(bundle => <option key={bundle.id} value={bundle.id}>11 · {bundle.upstreamUpdatedAt ?? t('Unknown source date')} · {bundle.id.slice(-8)} · {bundle.warnings.length} {t('warnings')}</option>)}
    </select></label>
    <button disabled={busy || !canSelect || !candidate || candidate === selectedId} onClick={() => void run(async () => {
      const bundle = bundles.find(item => item.id === candidate)
      if (bundle) await onSelect(bundle)
    })}>{selectedId ? t('Confirm snapshot change') : t('Use selected snapshot')}</button>
    <details><summary>{t('Manual download & missing data')}</summary>
      <p>{t('Minimum: Factions.csv and Datasheets.csv. Select all listed files together for profiles, abilities, stratagems and detachments. Export must be from 11th edition.')}</p>
      <ul>{Object.keys(FILES).map(file => <li key={file}><a href={`${EXPORT_BASE}${file}`} target="_blank" rel="noreferrer">{file}</a></li>)}</ul>
      <p>{t('CSV imports and cached snapshots stay on this device. Other phones must download or import the same snapshot.')}</p>
    </details>
  </details>
}
