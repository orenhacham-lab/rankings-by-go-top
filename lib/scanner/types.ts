export interface ScanInput {
  keyword: string
  targetDomain?: string | null
  targetBusinessName?: string | null
  country?: string
  language?: string
  city?: string | null
  deviceType?: string | null
}

export interface ScanOutput {
  found: boolean
  position: number | null
  resultUrl: string | null
  resultTitle: string | null
  resultAddress: string | null
  error: string | null
}
