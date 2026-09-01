import type { Army } from '../../domain/army/types'
import type { RulesDataProvider } from '../types'

export type StratagemDiagnosticRow = {
  name: string
  cp: number
  detachment: string
  phases: string[]
  classification: 'active' | 'reaction' | 'both'
  triggers: string[]
  fullyAutomatedTiming: boolean
  manualConfirmationRequired: boolean
}

export type ArmyStratagemDiagnostic = {
  faction: string
  selectedDetachments: string[]
  unresolvedDetachments: string[]
  warnings: string[]
  stratagems: StratagemDiagnosticRow[]
}

export function buildArmyStratagemDiagnostic(
  army: Pick<Army, 'faction' | 'detachments'>,
  provider: RulesDataProvider,
): ArmyStratagemDiagnostic {
  const resolution = provider.resolveArmyStratagems(army)
  return {
    faction: resolution.faction?.name ?? army.faction,
    selectedDetachments: resolution.selectedDetachments.map((detachment) => detachment.name),
    unresolvedDetachments: resolution.unresolvedDetachmentNames,
    warnings: resolution.warnings,
    stratagems: resolution.stratagems.map((stratagem) => ({
      name: stratagem.definition.name,
      cp: stratagem.definition.cpCost,
      detachment: stratagem.detachmentName,
      phases: stratagem.definition.phases.map(String),
      classification: stratagem.classification.toLocaleLowerCase('en') as StratagemDiagnosticRow['classification'],
      // Report only a trigger supplied by the external dataset. The domain's
      // CUSTOM_CONFIRMATION fallback is execution metadata, not a source fact.
      triggers: [...stratagem.sourceTriggerEvents],
      fullyAutomatedTiming: stratagem.fullyAutomatedTiming,
      manualConfirmationRequired: stratagem.manualConfirmationRequired,
    })),
  }
}

export function formatArmyStratagemDiagnostic(diagnostic: ArmyStratagemDiagnostic): string {
  const lines = [
    `Faction: ${diagnostic.faction}`,
    'Selected detachments:',
    ...diagnostic.selectedDetachments.map((name) => `- ${name}`),
    '',
    `Resolved Stratagems (${diagnostic.stratagems.length}):`,
  ]
  for (const stratagem of diagnostic.stratagems) {
    lines.push(
      `- ${stratagem.name}`,
      `  CP: ${stratagem.cp}`,
      `  Detachment: ${stratagem.detachment}`,
      `  Phases: ${stratagem.phases.join(', ')}`,
      `  Classification: ${stratagem.classification}`,
      `  Trigger: ${stratagem.triggers.join(', ') || 'not available'}`,
      `  Fully automated timing: ${stratagem.fullyAutomatedTiming ? 'yes' : 'no'}`,
      `  Manual confirmation required: ${stratagem.manualConfirmationRequired ? 'yes' : 'no'}`,
    )
  }
  if (diagnostic.warnings.length > 0) {
    lines.push('', 'Warnings:', ...diagnostic.warnings.map((warning) => `- ${warning}`))
  }
  return lines.join('\n')
}
