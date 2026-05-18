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

    // Create new trial subscription.
    // Trial is identified by status='trial' + trial_ends_at; the `plan` column
    // is only set when the user upgrades to a paid plan (regular/advanced/
    // premium/large_agency) via PayPal activation. Inserting `plan: 'trial'`
    // breaks because that value is not in the column's allowed set.
    const { error } = await admin.from('subscriptions').insert({
      user_id: userId,
      status: 'trial',
      trial_ends_at: trialEndsAt,
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
