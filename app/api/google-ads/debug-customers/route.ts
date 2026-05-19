import { createClient } from '@/lib/supabase/server'

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}

async function getGoogleAdsAccessToken(): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString(),
  })

  const tokenData = (await response.json()) as TokenResponse

  if (!response.ok || !tokenData.access_token) {
    const desc = tokenData.error_description || tokenData.error || ''
    if (/invalid_grant/i.test(desc)) {
      throw new Error('refresh_token_invalid')
    } else if (/invalid_client/i.test(desc)) {
      throw new Error('client_credentials_invalid')
    }
    throw new Error('oauth_token_failed')
  }

  return tokenData.access_token
}

export async function POST(request: Request) {
  try {
    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'Unauthorized', stage: 'auth' }, { status: 401 })
    }

    // Check required env vars
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
        { success: false, error: 'Google Ads API not configured' },
        { status: 503 }
      )
    }

    const configuredCustomerId = process.env.GOOGLE_ADS_CUSTOMER_ID!.replace(/-/g, '')
    const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID!.replace(/-/g, '')
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!

    // Get access token
    let accessToken: string
    try {
      accessToken = await getGoogleAdsAccessToken()
    } catch (error) {
      return Response.json(
        { success: false, error: 'Failed to obtain access token' },
        { status: 503 }
      )
    }

    // List accessible customers
    const listCustomersUrl = `https://googleads.googleapis.com/v22/customers:listAccessibleCustomers`

    const listResponse = await fetch(listCustomersUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'developer-token': developerToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (!listResponse.ok) {
      const errorBody = await listResponse.json().catch(() => ({}))
      console.error('[debug-customers] list error', errorBody)
      return Response.json(
        { success: false, error: 'Failed to list accessible customers' },
        { status: 502 }
      )
    }

    const listData = (await listResponse.json()) as { resourceNames?: string[] }
    const accessibleCustomerIds = (listData.resourceNames || [])
      .map((r) => r.replace('customers/', ''))
      .sort()

    // Try to get details for configured customer
    let configuredCustomerDetails: Record<string, unknown> | null = null
    if (accessibleCustomerIds.includes(configuredCustomerId)) {
      const getUrl = `https://googleads.googleapis.com/v22/customers/${configuredCustomerId}?fields=customer.id,customer.descriptive_name,customer.currency_code,customer.time_zone,customer.test_account`

      const getResponse = await fetch(getUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': developerToken,
          'login-customer-id': loginCustomerId,
        },
      })

      if (getResponse.ok) {
        const customerData = (await getResponse.json()) as { customer?: Record<string, unknown> }
        configuredCustomerDetails = customerData.customer || null
      }
    }

    return Response.json({
      success: true,
      configurationStatus: {
        configuredCustomerId,
        loginCustomerId,
        configuredCustomerIsAccessible: accessibleCustomerIds.includes(configuredCustomerId),
      },
      configuredCustomerDetails,
      accessibleCustomerIds,
      accessibleCustomersCount: accessibleCustomerIds.length,
      debug: {
        note: 'If configuredCustomerId is not in accessibleCustomerIds, there may be a customer account mismatch. The configured account may not be in the same MCC or may not have the required permissions.',
      },
    })
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[debug-customers] unexpected error', errorMsg)
    return Response.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
