/**
 * POST /api/shopify/link/resume — the FIRST-PARTY leg of the embedded linking
 * handoff.
 *
 * PRODUCTION BUG THIS EXISTS FOR. /api/shopify/embedded-install is called by
 * fetch() from inside the Shopify Admin iframe. For gotopseo.com that is a
 * third-party context, and modern Chrome rejects a SameSite=Lax cookie written
 * on such a response. The install itself succeeded (200), but the browser then
 * arrived at /shopify/link carrying no `shopify_pending_link` cookie at all and
 * the merchant was told "Linking session expired" with no way forward.
 *
 * The fix is a context change, NOT a weaker cookie. Relaxing the cookie to
 * SameSite=None would make the linking session attachable from any cross-site
 * request, which is exactly the property it must not have. Instead the embedded
 * client submits a real top-level form POST to this route (target="_top"), so
 * by the time this handler runs the browser is in a first-party gotopseo.com
 * document and the Set-Cookie below is first-party and accepted.
 *
 * WHAT IS BEING HANDED OVER. `handoff` is the same HMAC-signed opaque value the
 * cookie itself carries: a reference to a random, single-use, 30-minute
 * shopify_pending_installs row. It is NOT a credential — it contains no Shopify
 * access token, no refresh token, no client secret, no session token and no
 * user identity, and it grants nothing on its own. It is accepted only as a
 * POST form field, never a query parameter or fragment, so it cannot land in
 * browser history, a Referer header or a server access log, and it is never
 * logged here.
 *
 * The destination is the fixed internal path `/shopify/link`. Nothing about
 * where this redirects comes from the request, so there is no open redirect.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isContentModuleEnabled } from '@/lib/content/api-auth'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth'
import {
  PENDING_LINK_COOKIE, PENDING_LINK_TTL_MS,
  verifyPendingLinkCookieValue, loadValidPendingInstall,
} from '@/lib/shopify/pending-link'

export const runtime = 'nodejs'

/** The ONE destination this route can ever send a browser to. Fixed, internal. */
const LINK_PAGE_PATH = '/shopify/link'

/**
 * Input caps. The handoff is `${64 hex chars}.${64 hex chars}` = 129 bytes, so
 * both limits are generous while still refusing anything that is not plausibly
 * one — an oversized body is rejected before it is parsed or verified.
 */
const MAX_HANDOFF_CHARS = 512
const MAX_BODY_BYTES = 4096

export async function POST(request: Request) {
  if (!isContentModuleEnabled()) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = getShopifyOAuthConfig()
  if (!config) return NextResponse.json({ error: 'shopify_oauth_not_configured' }, { status: 500 })

  // Every rejection below lands on the SAME redirect with NO cookie set, so
  // this route can never be used to tell a valid handoff from an invalid one,
  // and a merchant who lands here with a stale value simply sees the ordinary
  // "linking session expired" page rather than an error.
  const linkUrl = new URL(LINK_PAGE_PATH, `${config.appUrl}/`).toString()
  const expired = () => NextResponse.redirect(linkUrl, 303)

  // Exactly one field, from a urlencoded body, and nothing else is read.
  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/x-www-form-urlencoded') return expired()

  let body: string
  try {
    body = await request.text()
  } catch {
    return expired()
  }
  if (body.length > MAX_BODY_BYTES) return expired()

  let handoff: string
  try {
    handoff = new URLSearchParams(body).get('handoff') || ''
  } catch {
    return expired()
  }
  if (!handoff || handoff.length > MAX_HANDOFF_CHARS) return expired()

  // 1) Signature — constant-time, same secret and same format as the cookie.
  const token = verifyPendingLinkCookieValue(handoff, config.clientSecret)
  if (!token) return expired()

  // 2) The DATABASE row is the real authority: it must still exist, be
  //    unexpired and be unconsumed. A signature alone proves only that we
  //    issued the value at some point, never that the install is still live —
  //    so a replayed, already-consumed or expired handoff dies here and no
  //    cookie is written. Nothing is consumed at this step: consumption stays
  //    where it belongs, inside complete_shopify_app_store_link, whose first
  //    statement is a conditional `UPDATE … SET consumed_at WHERE consumed_at
  //    IS NULL AND expires_at > now()` in the same transaction as the link
  //    itself. Two concurrent resumes therefore hand over the SAME single-use
  //    row, and only one of them can ever win that update — repeated or racing
  //    resumes can never produce two valid linking sessions.
  const admin = createAdminClient()
  const pending = await loadValidPendingInstall(admin, token)
  if (!pending) return expired()

  // 3) First-party Set-Cookie. Same attributes the embedded response used to
  //    attempt, but issued on a top-level navigation to our own origin, which
  //    is what makes it actually stick. The value stored is the ALREADY
  //    VERIFIED signed handoff — it is re-verified on every read.
  const res = NextResponse.redirect(linkUrl, 303)
  res.cookies.set(PENDING_LINK_COOKIE, handoff, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PENDING_LINK_TTL_MS / 1000,
  })
  return res
}
