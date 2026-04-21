import { NextResponse } from 'next/server'

export async function GET() {
  const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
  const googleClientIdLength = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.length || 0
  const hasAppUrl = !!process.env.NEXT_PUBLIC_APP_URL
  const hasClientSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET

  const customGoogleOAuthEnabled = hasGoogleClientId && hasAppUrl && hasClientSecret

  return NextResponse.json({
    status: customGoogleOAuthEnabled ? 'READY' : 'INCOMPLETE',
    customGoogleOAuthEnabled,
    checks: {
      'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID set': hasGoogleClientId,
      'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID length': googleClientIdLength,
      'NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID value': process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '(NOT SET)',
      'NEXT_PUBLIC_APP_URL set': hasAppUrl,
      'NEXT_PUBLIC_APP_URL value': process.env.NEXT_PUBLIC_APP_URL || '(NOT SET)',
      'GOOGLE_OAUTH_CLIENT_SECRET set': hasClientSecret,
    },
    oauthFlow: {
      ifCustomGoogleClientIdSet: 'Will use CUSTOM Google OAuth (shows your domain)',
      ifNotSet: 'Will fall back to SUPABASE OAuth (shows Supabase domain) ← This is likely happening',
      currentFlow: customGoogleOAuthEnabled ? 'CUSTOM Google OAuth' : 'SUPABASE OAuth (FALLBACK)',
    },
    nextSteps: !customGoogleOAuthEnabled ? [
      '1. Go to Vercel Project Settings → Environment Variables',
      '2. Make sure NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID is set with your Google Client ID',
      '3. Make sure NEXT_PUBLIC_APP_URL is set to https://www.gotopseo.com',
      '4. Make sure GOOGLE_OAUTH_CLIENT_SECRET is set (server-side)',
      '5. Click "Redeploy latest" in Vercel Deployments tab',
      '6. Wait for deployment to complete',
      '7. Reload this page and check status again',
    ] : [
      '✓ Custom Google OAuth is properly configured!',
      'The login page should now redirect to accounts.google.com instead of Supabase',
    ],
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    }
  })
}
