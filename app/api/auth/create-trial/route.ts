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

    // Check if user already has a subscription
    const { data: existing } = await admin
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .single()

    // If user has an active paid subscription, don't overwrite it
    if (existing && existing.status === 'active') {
      return Response.json(
        { error: 'User already has an active subscription' },
        { status: 400 }
      )
    }

    // If subscription exists (cancelled or trial), update it; otherwise insert new one
    if (existing) {
      const { error: updateError } = await admin
        .from('subscriptions')
        .update({
          status: 'trial',
          trial_ends_at: trialEndsAt,
        })
        .eq('user_id', userId)

      if (updateError) {
        console.error('Failed to update trial subscription:', updateError)
        return Response.json(
          { error: `Failed to update trial subscription: ${updateError.message}` },
          { status: 500 }
        )
      }
    } else {
      // Create new trial subscription.
      // Trial is identified by status='trial' + trial_ends_at; the `plan` column
      // is only set when the user upgrades to a paid plan (regular/advanced/
      // premium/large_agency) via PayPal activation.
      const { error: insertError } = await admin.from('subscriptions').insert({
        user_id: userId,
        status: 'trial',
        trial_ends_at: trialEndsAt,
      })

      if (insertError) {
        console.error('Failed to create trial subscription:', insertError)
        return Response.json(
          { error: `Failed to create trial subscription: ${insertError.message}` },
          { status: 500 }
        )
      }
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
