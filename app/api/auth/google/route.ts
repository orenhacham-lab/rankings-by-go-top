import { NextResponse, type NextRequest } from 'next/server'
import {
  GOOGLE_FLOW_COOKIE,
  googleAuthorizeUrl,
  googleDirectConfig,
  googleFlowCookieOptions,
  newGoogleFlow,
  sealGoogleFlow,
} from '@/lib/auth/google-direct'
import { googleSignInFailureUrl, isShopifyDestination } from '@/lib/auth/google-signin'

/**
 * Start of "Continue with Google" through the site's own Google client
 * (lib/auth/google-direct.ts). Public on purpose: it signs nobody in, it only
 * prepares a one-time flow in an httpOnly cookie and sends the browser to
 * Google. `next` and the language stay in that cookie, never in Google's URL.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const lang = searchParams.get('lang')
  const config = googleDirectConfig()
  const flow = newGoogleFlow(searchParams.get('next'), lang)
  // Not configured, or a Shopify destination (whose flow never offers Google):
  // back to the sign-in form with the generic line.
  if (!config || isShopifyDestination(flow.next)) {
    return noStore(NextResponse.redirect(googleSignInFailureUrl(origin, flow.lang)))
  }
  const res = NextResponse.redirect(googleAuthorizeUrl(config, flow, origin))
  res.cookies.set(GOOGLE_FLOW_COOKIE, sealGoogleFlow(config, flow), googleFlowCookieOptions())
  return noStore(res)
}

function noStore(res: NextResponse): NextResponse {
  res.headers.set('Cache-Control', 'no-store')
  return res
}
