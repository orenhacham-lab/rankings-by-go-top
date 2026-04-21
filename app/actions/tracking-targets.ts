'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getUserEntitlement } from '@/lib/subscription'
import { geocodeAddress, validateCoordinatePair } from '@/lib/geocoding'
import type { ExactPointResolutionSource } from '@/lib/supabase/types'

function safeStringFromFormData(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

interface ResolvedExactPoint {
  exact_address_input: string | null
  exact_resolved_lat: number
  exact_resolved_lng: number
  exact_resolution_source: ExactPointResolutionSource
  exact_geocoding_provider: string | null
}

/**
 * exact_point resolution is BLOCKING:
 * - Either direct valid lat/lng, OR
 * - A non-empty address that geocodes successfully.
 * If neither produces valid coords we throw — no partial state is ever saved.
 *
 * SAFETY: wrapped in try-catch at call site to prevent server component crashes.
 */
async function resolveExactPointFromFormData(
  formData: FormData,
  projectCountry: string
): Promise<ResolvedExactPoint> {
  const addressInput = safeStringFromFormData(formData, 'exact_address_input')
  const rawLat = safeStringFromFormData(formData, 'exact_resolved_lat')
  const rawLng = safeStringFromFormData(formData, 'exact_resolved_lng')

  // Path 1: direct coordinates take precedence when both are provided
  if (rawLat !== null && rawLng !== null) {
    const validated = validateCoordinatePair(rawLat, rawLng)
    if (!validated.ok) {
      throw new Error(`קואורדינטות לא תקינות: ${validated.reason}`)
    }
    return {
      exact_address_input: addressInput,
      exact_resolved_lat: validated.lat,
      exact_resolved_lng: validated.lng,
      exact_resolution_source: 'user_provided_coordinates',
      exact_geocoding_provider: null,
    }
  }

  // Path 2: address geocoding
  if (addressInput) {
    try {
      const geo = await geocodeAddress(addressInput, projectCountry)
      if (!geo.ok) {
        throw new Error(
          `כתובת לא ניתנת לפתרון — ${geo.reason}. ספקים שנוסו: ${geo.providersTried.join(', ')}`
        )
      }
      const source: ExactPointResolutionSource =
        geo.provider === 'google' ? 'geocoded_google' : 'geocoded_nominatim'
      return {
        exact_address_input: addressInput,
        exact_resolved_lat: geo.lat,
        exact_resolved_lng: geo.lng,
        exact_resolution_source: source,
        exact_geocoding_provider: geo.provider + (geo.usedFallback ? ' (fallback)' : ''),
      }
    } catch (err) {
      throw new Error(
        `שגיאה בפתרון כתובת: ${(err as Error).message || 'unknown error'}`
      )
    }
  }

  throw new Error('דרוש פתרון: ספק כתובת או קואורדינטות (lat/lng) עבור מצב "נקודה מדויקת"')
}

async function fetchProjectCountry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('country')
    .eq('id', projectId)
    .single()
  if (error || !data) throw new Error('לא נמצא פרויקט')
  return (data.country || 'IL').toString()
}

export async function createTrackingTargetAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('לא מחובר')

  const projectId = formData.get('project_id') as string

  // Enforce keyword limit per project
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const { count } = await supabase
      .from('tracking_targets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_active', true)

    if ((count ?? 0) >= entitlement.limits.maxKeywordsPerProject) {
      throw new Error(
        `הגעת למגבלת ${entitlement.limits.maxKeywordsPerProject} מילות מפתח לפרויקט בתוכנית ${entitlement.limits.label}. שדרג את המנוי להוספת מילות מפתח נוספות.`
      )
    }
  }

  const locationMode = safeStringFromFormData(formData, 'location_mode') || 'project'
  console.log('[CreateTarget] Form submission - locationMode:', {
    extracted: safeStringFromFormData(formData, 'location_mode'),
    final: locationMode,
    radius_center_zip: safeStringFromFormData(formData, 'radius_center_zip'),
    radius_miles: formData.get('radius_miles'),
    location_mode_from_form: formData.get('location_mode'),
  })

  const data: Record<string, unknown> = {
    user_id: user.id,
    project_id: projectId,
    keyword: formData.get('keyword') as string,
    engine_type: formData.get('engine_type') as string,
    target_domain: (formData.get('target_domain') as string) || null,
    target_business_name: (formData.get('target_business_name') as string) || null,
    preferred_landing_page: (formData.get('preferred_landing_page') as string) || null,
    notes: (formData.get('notes') as string) || null,
    location_mode: locationMode,
    custom_city: safeStringFromFormData(formData, 'custom_city'),
    grid_size: null,
    postal_code: safeStringFromFormData(formData, 'postal_code'),
    radius_center_zip: safeStringFromFormData(formData, 'radius_center_zip'),
    radius_miles: formData.get('radius_miles') ? Number(formData.get('radius_miles')) : null,
    is_active: true,
  }

  if (locationMode === 'radius') {
    console.log('[CreateTarget] RADIUS MODE DATA:', {
      keyword: data.keyword,
      location_mode: data.location_mode,
      radius_center_zip: data.radius_center_zip,
      radius_miles: data.radius_miles,
      custom_city: data.custom_city,
      postal_code: data.postal_code,
    })
  }

  if (locationMode === 'exact_point') {
    const projectCountry = await fetchProjectCountry(supabase, projectId)
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new Error('מצב "נקודה מדויקת" זמין רק לפרויקטי ארה"ב')
    }
    const resolved = await resolveExactPointFromFormData(formData, projectCountry)
    Object.assign(data, resolved)
  } else if (locationMode === 'radius') {
    const projectCountry = await fetchProjectCountry(supabase, projectId)
    // radius is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new Error('Radius Scan זמין רק לפרויקטי ארה"ב')
    }
    if (!data.radius_center_zip) {
      throw new Error('Radius Scan דורש ZIP code למרכז הסריקה')
    }
    if (!data.radius_miles || typeof data.radius_miles !== 'number' || data.radius_miles <= 0) {
      throw new Error('Radius Scan דורש מרחק תקין (מיילים)')
    }
    // Clear exact_point fields
    data.exact_address_input = null
    data.exact_resolved_lat = null
    data.exact_resolved_lng = null
    data.exact_resolution_source = null
    data.exact_geocoding_provider = null
  } else {
    data.exact_address_input = null
    data.exact_resolved_lat = null
    data.exact_resolved_lng = null
    data.exact_resolution_source = null
    data.exact_geocoding_provider = null
    data.radius_center_zip = null
    data.radius_miles = null
  }

  const { error } = await supabase.from('tracking_targets').insert(data)

  // If exact_point columns don't exist (migration not applied), retry without them
  if (error && error.message && /exact_(address_input|resolved_|resolution_|geocoding_)/.test(error.message)) {
    const {
      exact_address_input: _a,
      exact_resolved_lat: _b,
      exact_resolved_lng: _c,
      exact_resolution_source: _d,
      exact_geocoding_provider: _e,
      ...dataWithoutExact
    } = data
    void _a; void _b; void _c; void _d; void _e
    const { error: retryError } = await supabase.from('tracking_targets').insert(dataWithoutExact)
    if (retryError) throw new Error(retryError.message)
  } else if (error && error.message && /radius_(center_zip|miles)/.test(error.message)) {
    const {
      radius_center_zip: _r,
      radius_miles: _m,
      ...dataWithoutRadius
    } = data
    void _r; void _m
    if (locationMode === 'radius') {
      throw new Error('Radius Scan לא זמין — יש להפעיל את מיגרציית DB')
    }
    const { error: retryError } = await supabase.from('tracking_targets').insert(dataWithoutRadius)
    if (retryError) throw new Error(retryError.message)
  } else if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}

export async function createBulkTrackingTargetsAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('לא מחובר')

  const projectId = formData.get('project_id') as string
  const engineType = formData.get('engine_type') as string
  const targetDomain = (formData.get('target_domain') as string) || null
  const targetBusinessName = (formData.get('target_business_name') as string) || null
  const preferredLandingPage = (formData.get('preferred_landing_page') as string) || null
  const notes = (formData.get('notes') as string) || null
  const rawKeywords = formData.get('keywords') as string

  // Parse: split by newline, trim, filter empty lines, deduplicate
  const keywords = [
    ...new Set(
      rawKeywords
        .split('\n')
        .map((k) => k.trim())
        .filter((k) => k.length > 0)
    ),
  ]

  if (keywords.length === 0) {
    throw new Error('לא הוזנו מילות מפתח')
  }

  // Fetch existing keywords for this project to avoid duplicates
  const { data: existing } = await supabase
    .from('tracking_targets')
    .select('keyword')
    .eq('project_id', projectId)

  const existingSet = new Set((existing || []).map((r) => r.keyword.trim().toLowerCase()))

  const locationMode = safeStringFromFormData(formData, 'location_mode') || 'project'
  const customCity = safeStringFromFormData(formData, 'custom_city')
  const postalCode = safeStringFromFormData(formData, 'postal_code')

  // Resolve exact_point ONCE for the whole bulk batch (all new rows share the same location)
  let resolvedExact: ResolvedExactPoint | null = null
  if (locationMode === 'exact_point') {
    const projectCountry = await fetchProjectCountry(supabase, projectId)
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new Error('מצב "נקודה מדויקת" זמין רק לפרויקטי ארה"ב')
    }
    resolvedExact = await resolveExactPointFromFormData(formData, projectCountry)
  }

  const toInsert = keywords
    .filter((k) => !existingSet.has(k.toLowerCase()))
    .map((keyword) => ({
      user_id: user.id,
      project_id: projectId,
      keyword,
      engine_type: engineType,
      target_domain: targetDomain,
      target_business_name: targetBusinessName,
      preferred_landing_page: preferredLandingPage,
      notes,
      location_mode: locationMode,
      custom_city: customCity,
      grid_size: null,
      postal_code: postalCode,
      exact_address_input: resolvedExact?.exact_address_input ?? null,
      exact_resolved_lat: resolvedExact?.exact_resolved_lat ?? null,
      exact_resolved_lng: resolvedExact?.exact_resolved_lng ?? null,
      exact_resolution_source: resolvedExact?.exact_resolution_source ?? null,
      exact_geocoding_provider: resolvedExact?.exact_geocoding_provider ?? null,
      is_active: true,
    }))

  if (toInsert.length === 0) {
    throw new Error('כל מילות המפתח שהוזנו כבר קיימות בפרויקט')
  }

  // Enforce keyword limit per project
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const currentCount = existingSet.size
    const limit = entitlement.limits.maxKeywordsPerProject
    const available = Math.max(0, limit - currentCount)

    if (available === 0) {
      throw new Error(
        `הגעת למגבלת ${limit} מילות מפתח לפרויקט בתוכנית ${entitlement.limits.label}.`
      )
    }

    if (toInsert.length > available) {
      throw new Error(
        `ניתן להוסיף עוד ${available} מילות מפתח בלבד (מגבלת ${limit} בתוכנית ${entitlement.limits.label}).`
      )
    }
  }

  const { error } = await supabase.from('tracking_targets').insert(toInsert)

  // If exact_point columns don't exist (migration not applied), retry without them
  if (error && error.message && /exact_(address_input|resolved_|resolution_|geocoding_)/.test(error.message)) {
    const reduced = toInsert.map(row => {
      const {
        exact_address_input: _a,
        exact_resolved_lat: _b,
        exact_resolved_lng: _c,
        exact_resolution_source: _d,
        exact_geocoding_provider: _e,
        ...rest
      } = row
      void _a; void _b; void _c; void _d; void _e
      return rest
    })
    const { error: retryError } = await supabase.from('tracking_targets').insert(reduced)
    if (retryError) throw new Error(retryError.message)
  } else if (error) {
    throw new Error(error.message)
  }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')

  return { created: toInsert.length, skipped: keywords.length - toInsert.length }
}

export async function updateTrackingTargetAction(id: string, formData: FormData) {
  const supabase = await createClient()

  const locationMode = safeStringFromFormData(formData, 'location_mode') || 'project'
  console.log('[CreateTarget] Form submission - locationMode:', {
    extracted: safeStringFromFormData(formData, 'location_mode'),
    final: locationMode,
    radius_center_zip: safeStringFromFormData(formData, 'radius_center_zip'),
    radius_miles: formData.get('radius_miles'),
    location_mode_from_form: formData.get('location_mode'),
  })

  const data: Record<string, unknown> = {
    keyword: formData.get('keyword') as string,
    engine_type: formData.get('engine_type') as string,
    target_domain: (formData.get('target_domain') as string) || null,
    target_business_name: (formData.get('target_business_name') as string) || null,
    preferred_landing_page: (formData.get('preferred_landing_page') as string) || null,
    notes: (formData.get('notes') as string) || null,
    location_mode: locationMode,
    custom_city: safeStringFromFormData(formData, 'custom_city'),
    grid_size: null,
    postal_code: safeStringFromFormData(formData, 'postal_code'),
    radius_center_zip: safeStringFromFormData(formData, 'radius_center_zip'),
    radius_miles: formData.get('radius_miles') ? Number(formData.get('radius_miles')) : null,
  }

  if (locationMode === 'exact_point') {
    // Need project country to geocode — look up via the target row
    const { data: existing, error: lookupErr } = await supabase
      .from('tracking_targets')
      .select('project_id, projects!inner(country)')
      .eq('id', id)
      .single<{ project_id: string; projects: { country: string } }>()
    if (lookupErr || !existing) throw new Error('לא ניתן לטעון פרויקט עבור עדכון')
    const projectCountry = existing.projects.country || 'IL'
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new Error('מצב "נקודה מדויקת" זמין רק לפרויקטי ארה"ב')
    }
    const resolved = await resolveExactPointFromFormData(formData, projectCountry)
    Object.assign(data, resolved)
  } else if (locationMode === 'radius') {
    // Need project country to validate — look up via the target row
    const { data: existing, error: lookupErr } = await supabase
      .from('tracking_targets')
      .select('project_id, projects!inner(country)')
      .eq('id', id)
      .single<{ project_id: string; projects: { country: string } }>()
    if (lookupErr || !existing) throw new Error('לא ניתן לטעון פרויקט עבור עדכון')
    const projectCountry = existing.projects.country || 'IL'
    // radius is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new Error('Radius Scan זמין רק לפרויקטי ארה"ב')
    }
    if (!data.radius_center_zip) {
      throw new Error('Radius Scan דורש ZIP code למרכז הסריקה')
    }
    if (!data.radius_miles || typeof data.radius_miles !== 'number' || data.radius_miles <= 0) {
      throw new Error('Radius Scan דורש מרחק תקין (מיילים)')
    }
    // Clear exact_point fields
    data.exact_address_input = null
    data.exact_resolved_lat = null
    data.exact_resolved_lng = null
    data.exact_resolution_source = null
    data.exact_geocoding_provider = null
  } else {
    data.exact_address_input = null
    data.exact_resolved_lat = null
    data.exact_resolved_lng = null
    data.exact_resolution_source = null
    data.exact_geocoding_provider = null
    data.radius_center_zip = null
    data.radius_miles = null
  }

  let { error } = await supabase.from('tracking_targets').update(data).eq('id', id)

  // If exact_point columns don't exist (migration not applied), retry without them
  if (error && error.message && /exact_(address_input|resolved_|resolution_|geocoding_)/.test(error.message)) {
    const {
      exact_address_input: _a,
      exact_resolved_lat: _b,
      exact_resolved_lng: _c,
      exact_resolution_source: _d,
      exact_geocoding_provider: _e,
      ...reduced
    } = data
    void _a; void _b; void _c; void _d; void _e
    if (locationMode === 'exact_point') {
      throw new Error('מצב "נקודה מדויקת" לא זמין — יש להפעיל את מיגרציית DB')
    }
    ;({ error } = await supabase.from('tracking_targets').update(reduced).eq('id', id))
  }

  // If radius columns don't exist (migration not applied), retry without them
  if (error && error.message && /radius_(center_zip|miles)/.test(error.message)) {
    const {
      radius_center_zip: _r,
      radius_miles: _m,
      ...reduced
    } = data
    void _r; void _m
    if (locationMode === 'radius') {
      throw new Error('Radius Scan לא זמין — יש להפעיל את מיגרציית DB')
    }
    ;({ error } = await supabase.from('tracking_targets').update(reduced).eq('id', id))
  }

  // Backwards compatible retry for missing postal_code column
  if (error && error.message && error.message.includes('postal_code')) {
    const { postal_code: _p, ...dataWithoutPostal } = data
    void _p
    ;({ error } = await supabase.from('tracking_targets').update(dataWithoutPostal).eq('id', id))
  }

  if (error) throw new Error(error.message)

  revalidatePath('/keywords')
}

export async function toggleTrackingTargetActiveAction(id: string, isActive: boolean, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tracking_targets')
    .update({ is_active: !isActive })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}

export async function deleteTrackingTargetAction(id: string, projectId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('tracking_targets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/keywords')
}
