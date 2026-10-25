import { useEffect, useState } from 'react'
import { clockConfig, OFF_CLOCK, type ClockConfig, type ClockPreset } from './model'
import { clockCopy } from './copy'

export function ClockSettings({ value, onChange, disabled = false }: { value: ClockConfig; onChange: (value: ClockConfig) => void; disabled?: boolean }) {
  const c = clockCopy()
  const [minutes, setMinutes] = useState(String((value.limitMs || 5_400_000) / 60_000))
  useEffect(() => { if (value.preset === 'custom') setMinutes(String(value.limitMs / 60_000)) }, [value.limitMs, value.preset])
  return <fieldset className="clock-settings" disabled={disabled} lang="pl">
    <legend>{c.title}</legend>
    <label>{c.preset}<select value={value.preset} onChange={e => {
      const preset = e.target.value as ClockPreset
      onChange(clockConfig(preset, Number(minutes) >= 1 / 60 && Number(minutes) <= 10080 ? Number(minutes) : 90))
    }}>
      <option value="off">{c.off}</option><option value="casual">{c.casual}</option><option value="competitive">{c.competitive}</option><option value="custom">{c.custom}</option>
    </select></label>
    {value.preset === 'custom' && <label>{c.minutes}<input type="number" min={1 / 60} max={10080} step="any" required value={minutes} onChange={e => {
      const text = e.target.value
      setMinutes(text)
      const valid = Number(text) >= 1 / 60 && Number(text) <= 10080
      e.target.setCustomValidity(valid ? '' : '1 sekunda – 7 dni')
      if (valid) onChange(clockConfig('custom', Number(text)))
    }} /></label>}
    <small>{c.perTeam} {c.optional}</small>
  </fieldset>
}
export { OFF_CLOCK }
