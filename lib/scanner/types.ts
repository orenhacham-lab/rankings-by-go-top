export interface ScanInput {
  engine: string
  keyword: string
  targetDomain?: string | null
  targetBusinessName?: string | null
  country?: string
  language?: string
  city?: string | null
  deviceType?: string | null
  locationMode?: 'project' | 'custom' | 'grid'
  customCity?: string | null
  gridSize?: 'small' | 'medium' | 'large' | null
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

export interface GridPointResult {
  point_index: number
  lat: number
  lng: number
  label: string
  found: boolean
  position: number | null
  places_count: number
  matched_title?: string | null
  matched_address?: string | null
}

export interface ScanAudit {
  request: {
    keyword: string
    engine: string
    projectCity?: string | null
    projectCountry: string
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
    // Grid fields
    grid_enabled?: boolean
    grid_size?: string
    grid_points?: Array<{ lat: number; lng: number; label: string }>
    per_point_results?: GridPointResult[]
    best_position?: number | null
    avg_position?: number | null
    avg_position_mode?: 'found_only'
    worst_position?: number | null
    coverage?: number
    position_source?: 'best_of_grid'
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
