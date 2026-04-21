export interface ExactPointInput {
  lat: number
  lng: number
  addressInput?: string | null
  resolutionSource?: string | null
  geocodingProvider?: string | null
}

export interface RadiusCenter {
  lat: number
  lng: number
  centerZip?: string | null
  radiusMiles?: number | null
}

export interface ScanInput {
  engine: string
  keyword: string
  targetDomain?: string | null
  targetBusinessName?: string | null
  country?: string
  language?: string
  city?: string | null
  deviceType?: string | null
  locationMode?: 'project' | 'custom' | 'zip' | 'exact_point' | 'radius'
  customCity?: string | null
  postalCode?: string | null
  exactPoint?: ExactPointInput | null
  radiusCenter?: RadiusCenter | null
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
    projectCountry: string
    locationMode?: string
    locationSent?: string | null
    llSent?: string | null
    postalCodeSent?: string | null
    exactPointLat?: number
    exactPointLng?: number
    exactPointAddressInput?: string | null
    exactPointResolutionSource?: string | null
    exactPointGeocodingProvider?: string | null
    gl?: string
    hl?: string
    scanner_version?: string
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
  radiusScanMetadata?: {
    centerZip?: string | null
    centerLat: number
    centerLng: number
    radiusMiles: number
    pointsScanned: number
    successfulScans: number
    radiusAttempts: Array<{
      direction: string
      label: string
      lat: number
      lng: number
      distanceMiles: number
      found: boolean
      position?: number | null
    }>
    bestMatch: {
      direction: string
      label: string
      position: number
    } | null
  }
}
