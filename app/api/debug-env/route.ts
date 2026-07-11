import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    environment: {
      NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID || '(NOT SET)',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || '(NOT SET)',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '(NOT SET)',
      GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET ? '(SET - hidden for security)' : '(NOT SET)',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? '(SET - hidden for security)' : '(NOT SET)',
      NODE_ENV: process.env.NODE_ENV,
    },
    timestamp: new Date().toISOString(),
    message: 'If NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID shows "(NOT SET)", the environment variables need to be set in Vercel and the project needs to be redeployed.',
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    }
  })
}
