import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendSignupNotification } from '@/lib/notifications/signup-email'

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
