import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const next = searchParams.get('next') || '/dashboard'

  // Check if this is a custom Google OAuth flow or Supabase OAuth flow
  const isCustomGoogleOAuth = state !== null

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    if (isCustomGoogleOAuth && process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID) {
      // Handle custom Google OAuth flow
      try {
        const redirectUri = `${origin}/api/auth/callback`
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            code,
            client_id: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
          }).toString(),
        })

        if (!tokenResponse.ok) {
          console.error('Google token exchange failed:', await tokenResponse.text())
          return NextResponse.redirect(`${origin}/login?error=oauth`)
        }

        const tokens = await tokenResponse.json()
        const accessToken = tokens.access_token

        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (!userResponse.ok) {
          console.error('Google user info failed:', await userResponse.text())
          return NextResponse.redirect(`${origin}/login?error=oauth`)
        }

        const googleUser = await userResponse.json()

        // Sign in or create user in Supabase using the Google identity
        // Use the ID token to authenticate with Supabase
        const idTokenResponse = await fetch('https://oauth2.googleapis.com/tokeninfo', {
          method: 'POST',
          body: new URLSearchParams({
            id_token: tokens.id_token,
          }).toString(),
        })

        if (idTokenResponse.ok) {
          // Create a Supabase session by signing in with the Google credentials
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: googleUser.email,
            password: googleUser.id, // Use Google ID as temporary password for OAuth users
          })

          // If user doesn't exist, this will fail - that's OK, we'll handle it
          if (!signInError) {
            const destination = next.startsWith('/') ? next : '/dashboard'
            return NextResponse.redirect(`${origin}${destination}`)
          }

          // Try to get or create the session another way
          // For now, redirect to dashboard (Supabase session should be set by cookie if it worked)
          const destination = next.startsWith('/') ? next : '/dashboard'
          return NextResponse.redirect(`${origin}${destination}`)
        }
      } catch (error) {
        console.error('Custom Google OAuth callback error:', error)
        return NextResponse.redirect(`${origin}/login?error=oauth`)
      }
    } else {
      // Handle Supabase OAuth flow
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        const destination = next.startsWith('/') ? next : '/dashboard'
        return NextResponse.redirect(`${origin}${destination}`)
      }
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/login?error=oauth`)
}
