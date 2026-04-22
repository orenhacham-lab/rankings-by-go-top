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

        // Use a derived password from Google ID for this OAuth user
        const oauthPassword = `google_${googleUser.id.substring(0, 20)}`

        // Try to create the user, or use existing one
        console.log('[Google OAuth] Creating or getting user:', googleUser.email)
        let userEmail = googleUser.email
        let userCreatedNow = false

        const { data: createData, error: createError } = await adminSupabase.auth.admin.createUser({
          email: googleUser.email,
          password: oauthPassword,
          email_confirm: true, // CRITICAL: Mark email as confirmed so user can sign in immediately
          user_metadata: {
            full_name: googleUser.name || '',
            picture: googleUser.picture || '',
          },
        })

        if (createError) {
          // Check if user already exists by error code
          if (createError.code === 'email_exists') {
            console.log('[Google OAuth] User already exists with this email')
            console.log('[Google OAuth] Full error object:', JSON.stringify(createError, null, 2))
            userCreatedNow = false

            // Try to update password for existing user using admin API
            // Since we can't get user ID from error, we'll try updating and catch any errors
            console.log('[Google OAuth] Attempting to update password for existing user')

            // Try to list users and find the one with this email to get their ID
            console.log('[Google OAuth] Fetching user ID by listing all users...')
            const { data: allUsers, error: listError } = await adminSupabase.auth.admin.listUsers()

            if (listError) {
              console.error('[Google OAuth] Failed to list users:', listError.message)
            } else if (allUsers && allUsers.users) {
              const existingUser = allUsers.users.find(u => u.email === googleUser.email)
              if (existingUser) {
                console.log('[Google OAuth] Found user ID:', existingUser.id)

                const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
                  existingUser.id,
                  {
                    password: oauthPassword,
                    email_confirm: true  // CRITICAL: Also confirm email when updating password
                  }
                )

                if (updateError) {
                  console.error('[Google OAuth] Failed to update password:', updateError.message)
                } else {
                  console.log('[Google OAuth] ✓ Password updated successfully!')
                }
              } else {
                console.log('[Google OAuth] User not found in list')
              }
            } else {
              console.log('[Google OAuth] No users found')
            }
          } else {
            console.error('[Google OAuth] User creation error:', {
              message: createError.message,
              status: createError.status,
              code: createError.code,
            })
            return NextResponse.redirect(`${origin}/login?error=oauth&details=user_creation_failed`)
          }
        } else {
          console.log('[Google OAuth] New user created successfully')
          userCreatedNow = true
        }

        // For new users, or if magic link failed, try password sign-in
        // For existing users, they must have the Google-derived password set
        console.log('[Google OAuth] Attempting sign-in:', {
          email: googleUser.email,
          isNewUser: userCreatedNow,
        })

        const { error: signInError, data: signInData } = await supabase.auth.signInWithPassword({
          email: googleUser.email,
          password: oauthPassword,
        })

        if (signInError) {
          console.error('[Google OAuth] Sign in failed:', {
            message: signInError.message,
            code: signInError.code,
            isNewUser: userCreatedNow,
            email: googleUser.email,
          })

          // For existing users with password mismatch, ask them to use password reset
          if (!userCreatedNow && signInError.code === 'invalid_credentials') {
            console.log('[Google OAuth] Existing user with different password, suggesting password reset')
            return NextResponse.redirect(`${origin}/login?error=oauth&details=existing_user_different_password`)
          }

          return NextResponse.redirect(`${origin}/login?error=oauth&details=signin_failed`)
        }

        if (!signInData?.session) {
          console.error('[Google OAuth] No session returned after sign-in')
          return NextResponse.redirect(`${origin}/login?error=oauth&details=no_session`)
        }

        console.log('[Google OAuth] User signed in successfully')

        // Send email notification for new signups
        if (userCreatedNow) {
          try {
            await fetch(`${origin}/api/send-notification-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: googleUser.email,
                userName: googleUser.name || 'Google User',
              }),
            })
          } catch (emailError) {
            console.error('[Google OAuth] Failed to send notification email:', emailError)
            // Don't fail the signup if email fails
          }
        }

        const destination = next.startsWith('/') ? next : '/dashboard'
        return NextResponse.redirect(`${origin}${destination}`)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorStack = error instanceof Error ? error.stack : undefined

        console.error('[Google OAuth] CRITICAL CALLBACK ERROR:', {
          message: errorMessage,
          stack: errorStack?.substring(0, 300),
          type: error?.constructor?.name,
        })

        // Log environment check
        console.error('[Google OAuth] Environment at error:', {
          hasGoogleClientId: !!process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
          hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
          hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        })

        return NextResponse.redirect(`${origin}/login?error=oauth&details=callback_error`)
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
