import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isFreshSignup, sendSignupNotification } from '@/lib/notifications/signup-email'
import { reportSignupConversion } from '@/lib/analytics/meta-capi'

/**
 * POST /api/send-notification-email — tell the operator a new account opened.
 *
 * Requires the new user's own session. The request body is ignored: every
 * field in the email is taken from the verified Supabase user, HTML-escaped,
 * and only accounts created within the last 30 minutes are reported.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Email+password signup never passes through the auth callback, so this is
  // its one server-side moment. Gated on the same 30-minute freshness window as
  // the operator email, because this endpoint answers any signed-in session and
  // a conversion must mean a new account. The event id is per account, so one
  // that also reaches the callback is counted once. See lib/analytics/meta-capi.ts.
  if (isFreshSignup(user)) {
    await reportSignupConversion({ userId: user.id, email: user.email, createdAt: user.created_at })
  }

  try {
    const result = await sendSignupNotification(user)
    if (result.sent) return NextResponse.json({ success: true, messageId: result.messageId })
    if (result.reason === 'send_failed') {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }
    // Not a fresh signup, or email not configured: nothing to do.
    return NextResponse.json({ success: true, skipped: result.reason })
  } catch (error) {
    console.error('[email-route] unexpected error:', error instanceof Error ? error.name : 'unknown')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
