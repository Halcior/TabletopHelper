import type { RulesPresentation } from '../../rulesets/rulesSource'

export function RulesSourceBadge({ source }: Pick<RulesPresentation, 'source'>) {
  return <span className={`format-badge format-badge--${source}`}>
    <span aria-hidden="true">{source === 'official' ? '✓' : '◇'}</span>
    {source === 'official' ? 'Official format' : 'Community format'}
  </span>
}
