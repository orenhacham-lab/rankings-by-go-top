import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { buildQuotaError, buildEntitlementUnavailableError, isEntitlementUnknown } from '@/lib/quota'
import { calculateNextScanDate, isValidScanFrequency } from '@/lib/utils'
import { markScanOwnedFields, type SeedProjectField } from '@/lib/seed-scan/settings'
import { bilingualError } from '@/lib/i18n/action-messages'

// API Route for creating new projects
// Replaces Server Action approach to avoid production crashes

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) {
      console.error('[API] Auth error:', userError.message)
      return NextResponse.json(
        bilingualError('userLookupFailed'),
        { status: 401 }
      )
    }
    if (!user) {
      console.error('[API] No authenticated user')
      return NextResponse.json(
        bilingualError('notSignedIn'),
        { status: 401 }
      )
    }

    // Check user's plan and quotas
    // SERVICE-ROLE, not the request-scoped client: getUserEntitlement reads
    // billing_governance, which is REVOKEd from `authenticated` and errors
    // (42501) rather than returning an empty set — collapsing the whole
    // entitlement to zero limits. See lib/supabase/admin.ts.
    const entitlement = await getUserEntitlement(user.id, createAdminClient())
    // A read failure is not an exhausted quota: answering "you have reached
    // your limit of 0 — upgrade your plan" is what the reviewer saw. This is
    // transient and retryable, and nothing was spent.
    if (isEntitlementUnknown(entitlement.plan)) {
      return NextResponse.json(buildEntitlementUnavailableError(), { status: 503 })
    }
    const planLimits = PLAN_LIMITS[entitlement.plan]

    // Only enforce limits for non-admin users
    if (!entitlement.isAdmin) {
      // Count existing active projects for this user
      const { count: projectCount, error: countError } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (countError) {
        console.error('[API] Error counting projects:', countError.message)
        return NextResponse.json(
          bilingualError('projectsCheckFailed'),
          { status: 500 }
        )
      }

      // Check if user has reached their project quota
      if ((projectCount || 0) >= planLimits.maxProjects) {
        console.log('[API] User reached project quota:', { userId: user.id, plan: entitlement.plan, limit: planLimits.maxProjects })
        const payload = buildQuotaError(
          'QUOTA_PROJECTS',
          entitlement.plan,
          planLimits,
          planLimits.maxProjects
        )
        return NextResponse.json(payload, { status: 403 })
      }
    }

    // Parse form data
    const formData = await request.formData()
    const name = (formData.get('name') as string)?.trim()
    const targetDomain = (formData.get('target_domain') as string)?.trim()
    const clientId = (formData.get('client_id') as string)?.trim()

    if (!name) {
      console.error('[API] Missing required field: name')
      return NextResponse.json(
        bilingualError('projectNameRequired'),
        { status: 400 }
      )
    }

    if (!targetDomain) {
      console.error('[API] Missing required field: target_domain')
      return NextResponse.json(
        bilingualError('targetDomainRequired'),
        { status: 400 }
      )
    }

    if (!clientId) {
      console.error('[API] Missing required field: client_id')
      return NextResponse.json(
        bilingualError('clientRequired'),
        { status: 400 }
      )
    }

    const rawScanFrequency = (formData.get('scan_frequency') as string) || 'manual'
    // Phase 3 — reject weekly (and any other unsupported value) server-side,
    // never relying solely on the DB CHECK constraint.
    if (!isValidScanFrequency(rawScanFrequency)) {
      return NextResponse.json(bilingualError('unsupportedFrequency'), { status: 400 })
    }
    const scanFrequency = rawScanFrequency
    const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'
    const nextScanAt = autoScanEnabled && scanFrequency !== 'manual'
      ? calculateNextScanDate(scanFrequency)
      : null

    // Placeholders, not choices: a project created without a country or a
    // language gets IL / he, and the seed scan may replace them (see below).
    const placeholders: SeedProjectField[] = []
    if (!formData.get('country')) placeholders.push('country')
    if (!formData.get('language')) placeholders.push('language')

    const data = {
      user_id: user.id,
      client_id: clientId,
      name,
      target_domain: targetDomain,
      business_name: (formData.get('business_name') as string) || null,
      country: (formData.get('country') as string) || 'IL',
      language: (formData.get('language') as string) || 'he',
      city: (formData.get('city') as string) || null,
      device_type: (formData.get('device_type') as string) || null,
      scan_frequency: scanFrequency || 'manual',
      auto_scan_enabled: autoScanEnabled,
      next_scan_at: nextScanAt?.toISOString() || null,
      is_active: true,
    }

    console.log('[API] Creating project with payload:', {
      userId: user.id,
      name: data.name,
      targetDomain: data.target_domain,
    })

    // Insert into database
    // The new row's id comes back so the app can open the project it just
    // created. RLS returns only the caller's own row.
    const { data: insertResult, error } = await supabase.from('projects').insert(data).select('id').single()

    if (error) {
      console.error('[API] Database error:', {
        message: error.message,
        code: error.code,
      })
      return NextResponse.json(
        bilingualError('projectCreateFailed'),
        { status: 400 }
      )
    }

    console.log('[API] Project created successfully for user:', user.id)

    // The seed scan fills only a field that is empty or marked 'scan'
    // (lib/seed-scan/settings.ts), so the placeholders above are marked as the
    // scan's; a field the owner chose is never marked. Best effort: without
    // the mark the placeholder simply stays, as it did before the scan existed.
    const createdId = (insertResult as { id: string } | null)?.id
    if (createdId && placeholders.length > 0) {
      try {
        const marked = await markScanOwnedFields(createAdminClient(), { projectId: createdId, userId: user.id }, placeholders)
        if (!marked) console.warn('[API] Placeholder fields not marked for the scan:', { projectId: createdId })
      } catch {
        console.warn('[API] Placeholder fields not marked for the scan:', { projectId: createdId })
      }
    }

    // Revalidate the projects page
    revalidatePath('/projects')

    return NextResponse.json(
      { success: true, data: insertResult },
      { status: 201 }
    )
  } catch (err) {
    // Logged here; never returned — a thrown message is not written for the merchant.
    console.error('[API] Unexpected error:', err instanceof Error ? err.message : 'unknown', err)
    return NextResponse.json(
      bilingualError('requestFailed'),
      { status: 500 }
    )
  }
}
