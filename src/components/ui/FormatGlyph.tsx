import type { CauldronMode } from '../../rulesets/cauldronFFA3/types'

/** Original tactical symbols. Decorative only; they contain no faction art. */
export function FormatGlyph({ mode }: { mode: CauldronMode }) {
  const points = mode === 'duel' ? [[30, 38], [90, 38]]
    : mode === 'doubles2v2' ? [[24, 28], [43, 48], [78, 28], [97, 48]]
      : [[60, 14], [28, 58], [92, 58]]
  return <svg className={`format-glyph format-glyph--${mode}`} viewBox="0 0 120 76" fill="none" aria-hidden="true" focusable="false">
    <path className="format-glyph__route" d={mode === 'ffa3' ? 'M60 14 28 58H92Z' : 'M18 38H102'} />
    <circle className="format-glyph__orbit" cx="60" cy="38" r="28" />
    {points.map(([x, y], index) => <g key={index} className={`format-glyph__force format-glyph__force--${index}`}>
      <path d={`M${x} ${y - 10}l9 5v10l-9 5-9-5V${y - 5}Z`} />
      <path d={`M${x - 4} ${y}h8M${x} ${y - 4}v8`} />
    </g>)}
    <path className="format-glyph__ticks" d="M4 8V4H16M104 4h12v4M4 68v4h12M104 72h12v-4" />
  </svg>
}
