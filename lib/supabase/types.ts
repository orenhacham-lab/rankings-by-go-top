export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id' | 'created_at'>>
      }
      projects: {
        Row: Project
        Insert: Omit<Project, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Project, 'id' | 'created_at'>>
      }
      tracking_targets: {
        Row: TrackingTarget
        Insert: Omit<TrackingTarget, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<TrackingTarget, 'id' | 'created_at'>>
      }
      scans: {
        Row: Scan
        Insert: Omit<Scan, 'id' | 'created_at'>
        Update: Partial<Omit<Scan, 'id' | 'created_at'>>
      }
      scan_results: {
        Row: ScanResult
        Insert: Omit<ScanResult, 'id' | 'created_at'>
        Update: Partial<Omit<ScanResult, 'id' | 'created_at'>>
      }
    }
  }
}

export interface Client {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  client_id: string
  name: string
  target_domain: string
  business_name: string | null
  country: string
  language: string
  city: string | null
  device_type: 'desktop' | 'mobile' | null
  is_active: boolean
  scan_frequency: 'manual' | 'weekly' | 'monthly' | 'monthly_first_day'
  auto_scan_enabled: boolean
  next_scan_at: string | null
  last_scan_at: string | null
  created_at: string
  updated_at: string
  // joins
  clients?: Client
}

export type EngineType = 'google_search' | 'google_maps'
export type LocationMode = 'project' | 'custom' | 'grid' | 'zip' | 'exact_point'
export type GridSize = 'small' | 'medium' | 'large'
export type ExactPointResolutionSource =
  | 'user_provided_coordinates'
  | 'geocoded_google'
  | 'geocoded_nominatim'

export interface TrackingTarget {
  id: string
  project_id: string
  keyword: string
  engine_type: EngineType
  target_domain: string | null
  target_business_name: string | null
  preferred_landing_page: string | null
  notes: string | null
  is_active: boolean
  location_mode: LocationMode
  custom_city: string | null
  grid_size: GridSize | null
  postal_code: string | null
  exact_address_input: string | null
  exact_resolved_lat: number | null
  exact_resolved_lng: number | null
  exact_resolution_source: ExactPointResolutionSource | null
  exact_geocoding_provider: string | null
  created_at: string
  updated_at: string
  // joins
  projects?: Project
}

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface Scan {
  id: string
  project_id: string
  status: ScanStatus
  triggered_by: 'manual' | 'scheduled'
  total_targets: number
  completed_targets: number
  failed_targets: number
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  created_at: string
  // joins
  projects?: Project
}

export interface ScanResult {
  id: string
  scan_id: string
  tracking_target_id: string
  engine_type: EngineType
  keyword: string
  found: boolean
  position: number | null
  previous_position: number | null
  change_value: number | null
  result_url: string | null
  result_title: string | null
  result_address: string | null
  checked_at: string
  error_message: string | null
  audit_request: Json | null
  audit_response: Json | null
  audit_decision: Json | null
  audit_scanner_version: string | null
  created_at: string
  // joins
  tracking_targets?: TrackingTarget
  scans?: Scan
}

export interface Profile {
  id: string
  role: string
  created_at: string
  updated_at: string
}

export type SubscriptionPlan = 'regular' | 'advanced' | 'premium'
export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'cancelled' | 'expired'

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionPlan
  status: SubscriptionStatus
  paypal_subscription_id: string | null
  trial_ends_at: string | null
  current_period_start: string | null
  current_period_end: string | null
  scans_this_period: number
  scans_period_key: string | null
  created_at: string
  updated_at: string
}

export interface RankingSummary {
  tracking_target_id: string
  keyword: string
  engine_type: EngineType
  latest_position: number | null
  previous_position: number | null
  change_value: number | null
  best_position: number | null
  worst_position: number | null
  last_checked_at: string | null
  found: boolean
}
