import { NextResponse } from 'next/server'

export async function GET() {
  const hasGoogleClientId = !!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID
  const hasClientSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET

  return NextResponse.json({
    useCustomGoogleOAuth: hasGoogleClientId && hasClientSecret,
    googleClientId: hasGoogleClientId ? process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID : null,
  }, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    }
  })
}
