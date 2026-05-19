import { createClient } from '@/lib/supabase/server'

// Google Ads API version — bumped periodically by Google.
const GOOGLE_ADS_API_VERSION = 'v17'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

interface GoogleAdsErrorResponse {
  error?: {
    code?: number
    message?: string
    status?: string
  }
}

export async function GET() {
  try {
    // Require an authenticated user — never expose this endpoint anonymously
    // even though it does not return secrets.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Verify all required env vars exist. Report only the NAME of any
    //    missing var, never the value.
    const requiredEnvVars = [
      'GOOGLE_ADS_CLIENT_ID',
      'GOOGLE_ADS_CLIENT_SECRET',
      'GOOGLE_ADS_DEVELOPER_TOKEN',
      'GOOGLE_ADS_REFRESH_TOKEN',
      'GOOGLE_ADS_CUSTOMER_ID',
      'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
    ] as const

    const missing = requiredEnvVars.filter((name) => !process.env[name])
    if (missing.length > 0) {
      return Response.json(
        {
          success: false,
          stage: 'env_check',
          error: `Missing environment variables: ${missing.join(', ')}`,
        },
        { status: 500 }
      )
    }

    const clientId = process.env.GOOGLE_ADS_CLIENT_ID!
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET!
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!
    const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN!
    const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')

    // 2. Exchange the refresh token for a fresh access token.
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    })

    const tokenData = (await tokenResponse.json()) as TokenResponse

    if (!tokenResponse.ok || !tokenData.access_token) {
      // Build a friendly message without leaking tokens.
      const desc = tokenData.error_description || tokenData.error || ''
      let friendly = 'Failed to refresh Google OAuth access token.'
      if (/invalid_grant/i.test(desc) || /invalid_grant/i.test(tokenData.error || '')) {
        friendly = 'Refresh token is invalid or has been revoked. Re-authorize and update GOOGLE_ADS_REFRESH_TOKEN.'
      } else if (/invalid_client/i.test(desc) || /invalid_client/i.test(tokenData.error || '')) {
        friendly = 'OAuth client credentials are invalid. Check GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET.'
      }
      return Response.json(
        {
          success: false,
          stage: 'oauth_token',
          status: tokenResponse.status,
          error: friendly,
        },
        { status: 502 }
      )
    }

    const accessToken = tokenData.access_token

    // 3. Make a simple verification call to the Google Ads API.
    //    `customers:listAccessibleCustomers` is the canonical low-impact check:
    //    it requires a valid developer token + access token but no specific
    //    customer permissions, so it isolates auth/config errors clearly.
    const listResponse = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
        },
      }
    )

    if (!listResponse.ok) {
      const errorBody = (await listResponse.json().catch(() => ({}))) as GoogleAdsErrorResponse
      const apiMessage = errorBody.error?.message || ''
      const apiStatus = errorBody.error?.status || ''

      let friendly = 'Google Ads API request failed.'
      if (listResponse.status === 401) {
        friendly = 'Authentication failed. Access token rejected by Google Ads API.'
      } else if (listResponse.status === 403 || apiStatus === 'PERMISSION_DENIED') {
        if (/developer token/i.test(apiMessage)) {
          friendly = 'Developer token is invalid or not approved. Verify GOOGLE_ADS_DEVELOPER_TOKEN and approval status in Google Ads.'
        } else {
          friendly = 'Permission denied. Check that the OAuth account has access to the manager account and that GOOGLE_ADS_LOGIN_CUSTOMER_ID is correct.'
        }
      } else if (listResponse.status === 400) {
        friendly = 'Bad request. GOOGLE_ADS_LOGIN_CUSTOMER_ID may be malformed (must be 10 digits, no dashes).'
      }

      return Response.json(
        {
          success: false,
          stage: 'google_ads_api',
          status: listResponse.status,
          error: friendly,
        },
        { status: 502 }
      )
    }

    const listData = (await listResponse.json()) as { resourceNames?: string[] }
    const accessibleCount = listData.resourceNames?.length ?? 0

    // 4. Sanity-check that the configured CUSTOMER_ID is accessible to the
    //    authenticated identity. We compare without leaking the ID value.
    const configuredCustomerResource = `customers/${customerId}`
    const customerAccessible = (listData.resourceNames ?? []).includes(configuredCustomerResource)

    if (!customerAccessible) {
      return Response.json(
        {
          success: false,
          stage: 'customer_id_check',
          error:
            'OAuth account does not have access to the configured GOOGLE_ADS_CUSTOMER_ID. Verify the customer ID and that the OAuth user is linked to it.',
          accessibleAccountsCount: accessibleCount,
        },
        { status: 403 }
      )
    }

    return Response.json({
      success: true,
      message: 'Google Ads API connection works',
      accessibleAccountsCount: accessibleCount,
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    // Strip any accidental token-shaped substrings from the message.
    const safe = errorMsg.replace(/[A-Za-z0-9-_]{30,}/g, '[redacted]')
    return Response.json(
      {
        success: false,
        stage: 'unexpected',
        error: `Unexpected error during Google Ads connection test: ${safe}`,
      },
      { status: 500 }
    )
  }
}
