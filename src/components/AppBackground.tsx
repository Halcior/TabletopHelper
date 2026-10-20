type BackgroundPreset = 'tactical' | 'steel' | 'cartography'

// Internal presets share the same static layers; no user settings or saved-game fields.
export function AppBackground({ preset = 'tactical' }: { preset?: BackgroundPreset }) {
  return <div className="app-background" data-background={preset} aria-hidden="true"><div className="app-background__map" /></div>
}
