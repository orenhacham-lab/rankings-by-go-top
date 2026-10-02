import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { buildEntitlementUnavailableError, EN_PLAN_LABEL, isEntitlementUnknown } from '@/lib/quota'
import { ACTION_MESSAGES, bilingualError } from '@/lib/i18n/action-messages'

// API Route for creating new clients
// Replaces deprecated Server Action approach to avoid production crashes
// v2: Force Vercel rebuild

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

    // Count existing clients for this user
    const { count: clientCount, error: countError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (countError) {
      console.error('[API] Error counting clients:', countError.message)
      return NextResponse.json(
        bilingualError('clientsCheckFailed'),
        { status: 500 }
      )
    }

    // Check if user has reached their client quota
    if ((clientCount || 0) >= planLimits.maxClients) {
      console.log('[API] User reached client quota:', { userId: user.id, plan: entitlement.plan, limit: planLimits.maxClients })
      return NextResponse.json(
        { error: ACTION_MESSAGES.he.clientsLimit(planLimits.maxClients, planLimits.label), errorEn: ACTION_MESSAGES.en.clientsLimit(planLimits.maxClients, EN_PLAN_LABEL[entitlement.plan]) },
        { status: 403 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const name = (formData.get('name') as string)?.trim()

    if (!name) {
      console.error('[API] Missing required field: name')
      return NextResponse.json(
        bilingualError('clientNameRequired'),
        { status: 400 }
      )
    }

    const data = {
      user_id: user.id,
      name,
      contact_name: (formData.get('contact_name') as string) || null,
      email: (formData.get('email') as string) || null,
      phone: (formData.get('phone') as string) || null,
      notes: (formData.get('notes') as string) || null,
      is_active: true,
    }

    console.log('[API] Creating client with payload:', {
      userId: user.id,
      name: data.name,
    })

    // Insert into database
    const { data: insertResult, error } = await supabase.from('clients').insert(data)

    if (error) {
      console.error('[API] Database error:', {
        message: error.message,
        code: error.code,
      })
      return NextResponse.json(
        bilingualError('clientCreateFailed'),
        { status: 400 }
      )
    }

    console.log('[API] Client created successfully for user:', user.id)

    // Revalidate the clients page
    revalidatePath('/clients')

    return NextResponse.json(
      { success: true, data: insertResult, version: 'v2-api-route' },
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
