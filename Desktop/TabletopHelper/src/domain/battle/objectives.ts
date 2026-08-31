export function resolveObjectiveController(playerOC: Record<string, number>): string | null {
  const entries = Object.entries(playerOC)
  const highest = Math.max(0, ...entries.map(([, oc]) => oc))
  if (highest <= 0) return null
  const leaders = entries.filter(([, oc]) => oc === highest)
  return leaders.length === 1 ? leaders[0][0] : null
}
