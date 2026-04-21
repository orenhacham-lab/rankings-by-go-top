import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const next = searchParams.get('next') || '/dashboard'

  // Check if this is a custom Google OAuth flow (state starts with 'custom-google_')
  // or Supabase OAuth flow (state is from Supabase)
  const isCustomGoogleOAuth = state?.startsWith('custom-google_') ?? false

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
        console.log('[Google OAuth] Callback received:', {
          code: code?.substring(0, 20) + '...',
          state: state?.substring(0, 20) + '...',
          redirectUri,
          clientId: process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID?.substring(0, 20) + '...',
        })

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

        console.log('[Google OAuth] Token response status:', tokenResponse.status)

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text()
          console.error('[Google OAuth] Token exchange failed:', {
            status: tokenResponse.status,
            error: errorText.substring(0, 200),
          })
          return NextResponse.redirect(`${origin}/login?error=oauth`)
        }

        const tokens = await tokenResponse.json()
        const accessToken = tokens.access_token

        console.log('[Google OAuth] Token exchange successful')

        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        console.log('[Google OAuth] User info response status:', userResponse.status)

        if (!userResponse.ok) {
          const errorText = await userResponse.text()
          console.error('[Google OAuth] User info failed:', errorText.substring(0, 200))
          return NextResponse.redirect(`${origin}/login?error=oauth`)
        }

        const googleUser = await userResponse.json()
        console.log('[Google OAuth] User info retrieved:', {
          email: googleUser.email,
          id: googleUser.id,
        })

        // Use admin client to upsert the user in Supabase
        const adminSupabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
          }
        )

        // Get or create the user in Supabase auth
        const { data: userData, error: getUserError } = await adminSupabase.auth.admin.getUserById(
          googleUser.id
        )

        let user = userData?.user

        if (getUserError || !user) {
          // User doesn't exist, create them
          console.log('[Google OAuth] Creating new user in Supabase')
          const { data: newUserData, error: createError } = await adminSupabase.auth.admin.createUser({
            email: googleUser.email,
            user_metadata: {
              full_name: googleUser.name || '',
              picture: googleUser.picture || '',
            },
          })

          if (createError) {
            console.error('[Google OAuth] User creation failed:', createError.message)
            return NextResponse.redirect(`${origin}/login?error=oauth`)
          }

          user = newUserData.user
          console.log('[Google OAuth] User created successfully:', user?.id)
        } else {
          console.log('[Google OAuth] Existing user found:', user.id)
        }

        // Create a session for the user
        if (user) {
          const { data: sessionData, error: sessionError } = await adminSupabase.auth.admin.createSession({
            user_id: user.id,
            factor_id: undefined,
          })

          if (sessionError) {
            console.error('[Google OAuth] Session creation failed:', sessionError.message)
            return NextResponse.redirect(`${origin}/login?error=oauth`)
          }

          const session = sessionData.session

          // Set the session cookies
          if (session) {
            const cookieStore = await cookies()
            cookieStore.set('sb-access-token', session.access_token, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: session.expires_in,
            })

            if (session.refresh_token) {
              cookieStore.set('sb-refresh-token', session.refresh_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60, // 7 days
              })
            }

            console.log('[Google OAuth] Session created and cookies set')
            const destination = next.startsWith('/') ? next : '/dashboard'
            return NextResponse.redirect(`${origin}${destination}`)
          }
        }
      } catch (error) {
        console.error('[Google OAuth] Callback error:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined,
        })
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
