'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getUserEntitlement } from '@/lib/subscription'
import { buildQuotaError, EN_PLAN_LABEL, EntitlementUnavailableError, isEntitlementUnknown, KeywordQuotaError } from '@/lib/quota'
import { actionMessages, asActionResult, type ActionMessages, type ActionResult } from '@/lib/i18n/action-messages'
import { UserFacingError } from '@/lib/i18n/user-facing-error'
import { geocodeAddress, validateCoordinatePair } from '@/lib/geocoding'
import type { ExactPointResolutionSource } from '@/lib/supabase/types'
import { isAdminUser } from '@/lib/auth/admin-role'

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
  projectCountry: string,
  m: ActionMessages,
): Promise<ResolvedExactPoint> {
  const addressInput = safeStringFromFormData(formData, 'exact_address_input')
  const rawLat = safeStringFromFormData(formData, 'exact_resolved_lat')
  const rawLng = safeStringFromFormData(formData, 'exact_resolved_lng')

  // Path 1: direct coordinates take precedence when both are provided
  if (rawLat !== null && rawLng !== null) {
    const validated = validateCoordinatePair(rawLat, rawLng)
    if (!validated.ok) {
      throw new UserFacingError(m.invalidCoordinates)
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
    // The geocoder's own reason and the providers it tried are not shown (they
    // were English provider detail inside a Hebrew sentence): the merchant is
    // told what to do instead.
    let geo: Awaited<ReturnType<typeof geocodeAddress>>
    try {
      geo = await geocodeAddress(addressInput, projectCountry)
    } catch {
      throw new UserFacingError(m.addressUnresolvable)
    }
    if (!geo.ok) throw new UserFacingError(m.addressUnresolvable)
    const source: ExactPointResolutionSource =
      geo.provider === 'google' ? 'geocoded_google' : 'geocoded_nominatim'
    return {
      exact_address_input: addressInput,
      exact_resolved_lat: geo.lat,
      exact_resolved_lng: geo.lng,
      exact_resolution_source: source,
      exact_geocoding_provider: geo.provider + (geo.usedFallback ? ' (fallback)' : ''),
    }
  }

  throw new UserFacingError(m.exactPointNeedsLocation)
}

async function fetchProjectCountry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  m: ActionMessages,
): Promise<string> {
  const { data, error } = await supabase
    .from('projects')
    .select('country')
    .eq('id', projectId)
    .single()
  if (error || !data) throw new UserFacingError(m.projectNotFound)
  return (data.country || 'IL').toString()
}

/**
 * The project must belong to the caller. The insert runs on the session client,
 * and tracking_targets' RLS WITH CHECK now enforces this too
 * (20260925000000_security_owasp_hardening.sql); this check fails early with a
 * clear message and does not depend on the policy alone. Under RLS a foreign
 * project is simply invisible, so "not found" and "not yours" read the same.
 */
async function assertOwnedProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  projectId: string,
  m: ActionMessages,
): Promise<void> {
  if (!projectId) throw new UserFacingError(m.projectNotFound)
  const { data } = await supabase.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
  const owner = (data as { user_id?: string | null } | null)?.user_id
  if (!data || (owner !== userId && !(await isAdminUser(createAdminClient(), userId)))) {
    throw new UserFacingError(m.projectNotFound)
  }
}

export async function createTrackingTargetAction(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { locale, m } = await actionMessages(user?.user_metadata?.locale)
  if (!user) throw new UserFacingError(m.notSignedIn)

  const projectId = formData.get('project_id') as string
  await assertOwnedProject(supabase, user.id, projectId, m)

  // Enforce keyword limit per project
  // SERVICE-ROLE, not the request-scoped client: getUserEntitlement reads
  // billing_governance, which is REVOKEd from `authenticated` and errors
  // (42501) rather than returning an empty set — collapsing the whole
  // entitlement to zero limits. See lib/supabase/admin.ts.
  const entitlement = await getUserEntitlement(user.id, createAdminClient())
  // A read failure is not an exhausted quota. Throwing a quota message here is
  // what surfaced to the reviewer as a generic server error on "Add keyword".
  if (isEntitlementUnknown(entitlement.plan)) {
    throw new EntitlementUnavailableError(locale)
  }
  if (!entitlement.isAdmin) {
    const { count } = await supabase
      .from('tracking_targets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('is_active', true)

    if ((count ?? 0) >= entitlement.limits.maxKeywordsPerProject) {
      const q = buildQuotaError('QUOTA_KEYWORDS_PER_PROJECT', entitlement.plan, entitlement.limits, entitlement.limits.maxKeywordsPerProject)
      throw new KeywordQuotaError(locale === 'en' ? q.errorEn : q.error)
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

  const radiusMilesStr = safeStringFromFormData(formData, 'radius_miles')
  const radiusMiles = radiusMilesStr ? parseInt(radiusMilesStr, 10) : null
  const radiusCenterZip = safeStringFromFormData(formData, 'radius_center_zip')

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
    radius_miles: radiusMiles,
    radius_center_zip: radiusCenterZip,
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
    const projectCountry = await fetchProjectCountry(supabase, projectId, m)
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new UserFacingError(m.exactPointUsOnly)
    }
    const resolved = await resolveExactPointFromFormData(formData, projectCountry, m)
    Object.assign(data, resolved)
  } else if (locationMode === 'radius') {
    const projectCountry = await fetchProjectCountry(supabase, projectId, m)
    // radius is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new UserFacingError(m.radiusUsOnly)
    }
    if (!data.radius_center_zip) {
      throw new UserFacingError(m.radiusZipRequired)
    }
    if (!data.radius_miles || typeof data.radius_miles !== 'number' || data.radius_miles <= 0) {
      throw new UserFacingError(m.radiusDistanceInvalid)
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
      throw new UserFacingError(m.radiusUnavailable)
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
  const { locale, m } = await actionMessages(user?.user_metadata?.locale)
  if (!user) throw new UserFacingError(m.notSignedIn)

  const projectId = formData.get('project_id') as string
  await assertOwnedProject(supabase, user.id, projectId, m)
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
    throw new UserFacingError(m.noKeywords)
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
  const radiusMilesStr = safeStringFromFormData(formData, 'radius_miles')
  const radiusMiles = radiusMilesStr ? parseInt(radiusMilesStr, 10) : null
  const radiusCenterZip = safeStringFromFormData(formData, 'radius_center_zip')

  // Resolve exact_point ONCE for the whole bulk batch (all new rows share the same location)
  let resolvedExact: ResolvedExactPoint | null = null
  if (locationMode === 'exact_point') {
    const projectCountry = await fetchProjectCountry(supabase, projectId, m)
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new UserFacingError(m.exactPointUsOnly)
    }
    resolvedExact = await resolveExactPointFromFormData(formData, projectCountry, m)
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
      radius_miles: radiusMiles,
      radius_center_zip: radiusCenterZip,
      exact_address_input: resolvedExact?.exact_address_input ?? null,
      exact_resolved_lat: resolvedExact?.exact_resolved_lat ?? null,
      exact_resolved_lng: resolvedExact?.exact_resolved_lng ?? null,
      exact_resolution_source: resolvedExact?.exact_resolution_source ?? null,
      exact_geocoding_provider: resolvedExact?.exact_geocoding_provider ?? null,
      is_active: true,
    }))

  if (toInsert.length === 0) {
    throw new UserFacingError(m.allKeywordsExist)
  }

  // Enforce keyword limit per project
  // SERVICE-ROLE, not the request-scoped client: getUserEntitlement reads
  // billing_governance, which is REVOKEd from `authenticated` and errors
  // (42501) rather than returning an empty set — collapsing the whole
  // entitlement to zero limits. See lib/supabase/admin.ts.
  const entitlement = await getUserEntitlement(user.id, createAdminClient())
  // A read failure is not an exhausted quota. Throwing a quota message here is
  // what surfaced to the reviewer as a generic server error on "Add keyword".
  if (isEntitlementUnknown(entitlement.plan)) {
    throw new EntitlementUnavailableError(locale)
  }
  if (!entitlement.isAdmin) {
    const currentCount = existingSet.size
    const limit = entitlement.limits.maxKeywordsPerProject
    const available = Math.max(0, limit - currentCount)
    const planName = locale === 'en' ? EN_PLAN_LABEL[entitlement.plan] : entitlement.limits.label

    if (available === 0) {
      throw new KeywordQuotaError(m.keywordsLimitReached(limit, planName))
    }

    if (toInsert.length > available) {
      throw new KeywordQuotaError(m.keywordsOnlyRoomFor(available, limit, planName))
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
  const { m } = await actionMessages()

  const locationMode = safeStringFromFormData(formData, 'location_mode') || 'project'
  const radiusMilesStr = safeStringFromFormData(formData, 'radius_miles')
  const radiusMiles = radiusMilesStr ? parseInt(radiusMilesStr, 10) : null
  const radiusCenterZip = safeStringFromFormData(formData, 'radius_center_zip')

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
    radius_miles: radiusMiles,
    radius_center_zip: radiusCenterZip,
  }

  if (locationMode === 'exact_point') {
    // Need project country to geocode — look up via the target row
    const { data: existing, error: lookupErr } = await supabase
      .from('tracking_targets')
      .select('project_id, projects!inner(country)')
      .eq('id', id)
      .single<{ project_id: string; projects: { country: string } }>()
    if (lookupErr || !existing) throw new UserFacingError(m.projectNotFound)
    const projectCountry = existing.projects.country || 'IL'
    // exact_point is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new UserFacingError(m.exactPointUsOnly)
    }
    const resolved = await resolveExactPointFromFormData(formData, projectCountry, m)
    Object.assign(data, resolved)
  } else if (locationMode === 'radius') {
    // Need project country to validate — look up via the target row
    const { data: existing, error: lookupErr } = await supabase
      .from('tracking_targets')
      .select('project_id, projects!inner(country)')
      .eq('id', id)
      .single<{ project_id: string; projects: { country: string } }>()
    if (lookupErr || !existing) throw new UserFacingError(m.projectNotFound)
    const projectCountry = existing.projects.country || 'IL'
    // radius is US-only
    if (projectCountry.toUpperCase() !== 'US') {
      throw new UserFacingError(m.radiusUsOnly)
    }
    if (!data.radius_center_zip) {
      throw new UserFacingError(m.radiusZipRequired)
    }
    if (!data.radius_miles || typeof data.radius_miles !== 'number' || data.radius_miles <= 0) {
      throw new UserFacingError(m.radiusDistanceInvalid)
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
      throw new UserFacingError(m.exactPointUnavailable)
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
      throw new UserFacingError(m.radiusUnavailable)
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

/**
 * The keywords form's one entry point: the same work as the three actions
 * above, with its refusal RETURNED in the merchant's language instead of
 * thrown (a thrown message does not survive the server-action boundary in
 * production — see lib/i18n/action-messages.ts).
 */
export async function saveTrackingTargetsAction(
  mode: 'create' | 'bulk' | 'update',
  formData: FormData,
  targetId?: string,
): Promise<ActionResult<{ created?: number; skipped?: number }>> {
  return asActionResult(async () => {
    if (mode === 'update') {
      if (!targetId) throw new UserFacingError((await actionMessages()).m.saveFailed)
      await updateTrackingTargetAction(targetId, formData)
      return {}
    }
    if (mode === 'bulk') return createBulkTrackingTargetsAction(formData)
    await createTrackingTargetAction(formData)
    return {}
  }, 'tracking-targets')
}
