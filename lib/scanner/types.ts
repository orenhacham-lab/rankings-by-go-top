export interface ScanInput {
  engine: string
  keyword: string
  targetDomain?: string | null
  targetBusinessName?: string | null
  country?: string
  language?: string
  city?: string | null
  deviceType?: string | null
}

export interface ScanAttempt {
  attemptNumber: number
  context: string
  location?: string | null
  ll?: string | null
  found: boolean
  matchedTitle?: string | null
  matchedPosition?: number | null
  matchedAddress?: string | null
  geoValidationPassed?: boolean
  rejectionReason?: string | null
}

export interface ScanAudit {
  request: {
    keyword: string
    engine: string
    projectCity?: string | null
    projectCountry?: string
    locationSent?: string | null
    llSent?: string | null
    gl?: string
    hl?: string
  }
  response: {
    searchParameters?: Record<string, unknown>
    placesCount?: number
    placesSample?: Array<{ title?: string }>
    rawResponse?: unknown
    rawResponseTruncated?: boolean
  }
  decision: {
    found: boolean
    matchedPosition?: number | null
    matchedTitle?: string | null
    matchedAddress?: string | null
    attempts: ScanAttempt[]
    successfulAttemptIndex?: number
    geoValidationPassed?: boolean
    rejectionReason?: string | null
  }
}

export interface ScanOutput {
  found: boolean
  position: number | null
  resultUrl: string | null
  resultTitle: string | null
  resultAddress: string | null
  error: string | null
  audit?: ScanAudit
}
