import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { userId, trialEndsAt } = body

    if (!userId || !trialEndsAt) {
      return Response.json(
        { error: 'userId and trialEndsAt are required' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    // Mark any existing trial or active subscriptions as cancelled
    await admin
      .from('subscriptions')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .in('status', ['trial', 'active'])

    // Create new trial subscription
    const { error } = await admin.from('subscriptions').insert({
      user_id: userId,
      plan: 'trial',
      status: 'trial',
      trial_ends_at: trialEndsAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error('Failed to create trial subscription:', error)
      return Response.json(
        { error: `Failed to create trial subscription: ${error.message}` },
        { status: 500 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('Trial creation error:', error)
    return Response.json(
      { error: `Trial creation failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}
