import embeddedSource from './generated'
import type { FortyKdcSource } from './sourceTypes'

/**
 * Converts the package's linked collections into the small, stable shape used
 * by the adapter. This is the only module that imports runtime 40kdc types.
 */
export function loadEmbedded40kdcSource(): FortyKdcSource {
  return embeddedSource as unknown as FortyKdcSource
}
