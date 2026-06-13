import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'
import { getUserEntitlement, PLAN_LIMITS } from '@/lib/subscription'

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

    // Count existing clients for this user
    const { count: clientCount, error: countError } = await supabase
      .from('clients')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (countError) {
      console.error('[API] Error counting clients:', countError.message)
      return NextResponse.json(
        { error: 'שגיאה בבדיקת הלקוחות הקיימים' },
        { status: 500 }
      )
    }

    // Check if user has reached their client quota
    if ((clientCount || 0) >= planLimits.maxClients) {
      console.log('[API] User reached client quota:', { userId: user.id, plan: entitlement.plan, limit: planLimits.maxClients })
      return NextResponse.json(
        { error: `הגעת למכסה של ${planLimits.maxClients} לקוחות בתוכנית ${planLimits.label}. שדרג את התוכנית כדי להוסיף עוד לקוחות.` },
        { status: 403 }
      )
    }

    // Parse form data
    const formData = await request.formData()
    const name = (formData.get('name') as string)?.trim()

    if (!name) {
      console.error('[API] Missing required field: name')
      return NextResponse.json(
        { error: 'שם הלקוח הוא שדה חובה' },
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
        { error: `שגיאה בהוספת לקוח: ${error.message}` },
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
    const message = err instanceof Error ? err.message : 'שגיאה בעיבוד הבקשה'
    console.error('[API] Unexpected error:', message, err)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
