import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'
import { calculateNextScanDate } from '@/lib/utils'

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
        { error: 'שגיאה בקבלת פרטי משתמש' },
        { status: 401 }
      )
    }
    if (!user) {
      console.error('[API] No authenticated user')
      return NextResponse.json(
        { error: 'משתמש לא מחובר' },
        { status: 401 }
      )
    }

    // Check user's plan and quotas
    const entitlement = await getUserEntitlement(user.id, supabase)
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
          { error: 'שגיאה בבדיקת הפרויקטים הקיימים' },
          { status: 500 }
        )
      }

      // Check if user has reached their project quota
      if ((projectCount || 0) >= planLimits.maxProjects) {
        console.log('[API] User reached project quota:', { userId: user.id, plan: entitlement.plan, limit: planLimits.maxProjects })
        return NextResponse.json(
          { error: `הגעת למגבלת ${planLimits.maxProjects} פרויקטים בתוכנית ${planLimits.label}. שדרג את המנוי להוספת פרויקטים נוספים.` },
          { status: 403 }
        )
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
        { error: 'שם הפרויקט הוא שדה חובה' },
        { status: 400 }
      )
    }

    if (!targetDomain) {
      console.error('[API] Missing required field: target_domain')
      return NextResponse.json(
        { error: 'דומיין יעד הוא שדה חובה' },
        { status: 400 }
      )
    }

    if (!clientId) {
      console.error('[API] Missing required field: client_id')
      return NextResponse.json(
        { error: 'בחירת לקוח היא שדה חובה' },
        { status: 400 }
      )
    }

    const scanFrequency = formData.get('scan_frequency') as string
    const autoScanEnabled = formData.get('auto_scan_enabled') === 'true'
    const nextScanAt = autoScanEnabled && scanFrequency !== 'manual'
      ? calculateNextScanDate(scanFrequency)
      : null

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
    const { data: insertResult, error } = await supabase.from('projects').insert(data)

    if (error) {
      console.error('[API] Database error:', {
        message: error.message,
        code: error.code,
      })
      return NextResponse.json(
        { error: `שגיאה בהוספת פרויקט: ${error.message}` },
        { status: 400 }
      )
    }

    console.log('[API] Project created successfully for user:', user.id)

    // Revalidate the projects page
    revalidatePath('/projects')

    return NextResponse.json(
      { success: true, data: insertResult },
      { status: 201 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'שגיאה בעיבוד הבקשה'
    console.error('[API] Unexpected error:', message, err)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
