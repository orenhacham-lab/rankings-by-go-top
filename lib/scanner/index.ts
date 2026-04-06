import { scanGoogleSearch } from './google-search'
import { scanGoogleMaps } from './google-maps'
import { ScanInput, ScanOutput } from './types'

export type { ScanInput, ScanOutput }

export async function runScan(engine: string, input: ScanInput): Promise<ScanOutput> {
  if (engine === 'google_search') {
    return scanGoogleSearch(input)
  }
  if (engine === 'google_maps') {
    return scanGoogleMaps(input)
  }
  return {
    found: false,
    position: null,
    resultUrl: null,
    resultTitle: null,
    resultAddress: null,
    error: `Unknown engine: ${engine}`,
  }
}
