import { FortyKdcRulesDataProvider } from './adapter'
import { loadEmbedded40kdcSource } from './source'

export const FORTY_KDC_ATTRIBUTION = {
  label: 'Powered by 40kdc-data',
  url: 'https://40kdc.alpacasoft.dev',
} as const

export function create40kdcRulesDataProvider(): FortyKdcRulesDataProvider {
  return new FortyKdcRulesDataProvider(loadEmbedded40kdcSource())
}

export { FortyKdcRulesDataProvider } from './adapter'
export * from './diagnostics'
export { loadEmbedded40kdcSource } from './source'
export type * from './sourceTypes'
