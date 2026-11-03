import { t as tr } from '../../features/i18n/locale'
import type { RulesPresentation } from '../../rulesets/rulesSource'

export function RulesSourceBadge({ source }: Pick<RulesPresentation, 'source'>) {
  return <span className={`format-badge format-badge--${source}`}>
    <span aria-hidden="true">{source === 'official' ? '✓' : '◇'}</span>
    {source === 'official' ? tr('Official format') : tr('Community format')}
  </span>
}
