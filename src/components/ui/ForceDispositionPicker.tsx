import type { Army } from '../../domain/army/types'
import { assessForceDispositions } from '../../domain/army/forceDisposition'
import { armyDataMayBeOutdated, OUTDATED_ARMY_NOTICE } from '../../domain/army/roster'
import { DISPOSITIONS, DISPOSITION_NAMES, type ForceDisposition } from '../../rulesets/cauldronFFA3/duelPrimary'
import { OFFICIAL_RULES } from '../../rulesets/officialRuleVersions'
import { t as tr } from '../../features/i18n/locale'

type Props = {
  armies: (Army | undefined)[]
  value: ForceDisposition | ''
  onChange: (value: ForceDisposition) => void
  disabled?: boolean
  lobby?: boolean
}

export function ForceDispositionPicker({ armies, value, onChange, disabled, lobby }: Props) {
  const { evidence, hasCompleteEvidence, current, published } = assessForceDispositions(armies)
  const verified = value !== '' && current.has(value)
  const conflict = value !== '' && !verified && (hasCompleteEvidence || published.size > 0 && !published.has(value))
  return <>
    <label>{tr('Force Disposition')}<select value={value} disabled={disabled} onChange={event => onChange(event.target.value as ForceDisposition)}>
      {!value && <option value="" disabled>{tr('Choose your Force Disposition…')}</option>}
      {DISPOSITIONS.map(id => <option key={id} value={id}>
        {DISPOSITION_NAMES[id]}{current.has(id) ? tr(' · available') : published.has(id) ? tr(' · previously published') : ''}
      </option>)}
    </select></label>
    {!verified && <p className="context-note">
      <strong>{tr('Not verified')}</strong>{' · '}
      {conflict ? tr('The selected disposition is absent from the documented detachments. Check the current rules for these armies.')
        : tr('Check your detachments against the current Munitorum Field Manual.')}
      {value && !lobby && <> {tr('Starting the battle confirms this choice manually.')}</>}
    </p>}
    {armies.some(army => army && armyDataMayBeOutdated(army)) && <p className="context-note">{tr(OUTDATED_ARMY_NOTICE)}</p>}
    {evidence.some(({ detachments }) => detachments.length > 0) && <details>
      <summary>{tr('Detachment points and sources')}</summary>
      {evidence.map(({ army, detachments }, index) => army && <div key={index}>
        <strong>{army.name}</strong>
        <ul className="context-note">{detachments.map((rule, i) => <li key={i}>
          {rule.name}{rule.dp !== undefined && <> · {rule.dp} DP</>}
          {rule.dispositions.length > 0 && <> · {rule.dispositions.map(id => DISPOSITION_NAMES[id]).join(', ')}</>}
          {' · '}{rule.status === 'historical' ? tr('Historical source') : rule.status === 'partial' ? tr('DP only') : rule.status === 'verified' ? tr('Verified') : tr('Not verified')}
          {rule.dp !== undefined && rule.source && <> · <a href={rule.source.url} target="_blank" rel="noreferrer">{rule.source.date}</a></>}
        </li>)}</ul>
      </div>)}
      <p className="context-note"><a href={OFFICIAL_RULES.sources.mfm.url} target="_blank" rel="noreferrer">{tr('Munitorum Field Manual')}</a></p>
    </details>}
  </>
}
