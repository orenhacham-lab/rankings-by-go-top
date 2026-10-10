/**
 * GET|POST /api/outreach/unsubscribe?t=<signed token> — the link in every outbound
 * prospecting email.
 *
 * proxy.ts does not cover /api/*, so this handler authenticates itself: there is no
 * session and there never will be (the recipient has no account), so the signed token
 * IS the credential (lib/outreach/unsubscribe-token.ts).
 *
 * It only ever ADDS to the suppression list, for the one address the token names, and
 * doing it twice is the same as doing it once. There is no redirect anywhere, so there
 * is no `next` and no way off the site. The page is English because this channel writes
 * only to businesses verified to be operating in the United States.
 *
 * A mail client that prefetches the link unsubscribes that address. That is the safe
 * direction: the cost is a message we do not send.
 *
 * No database or provider text reaches the answer or a log line, and the page never
 * echoes the address back — a scanner following the link should not render it.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { suppress } from '@/lib/email-suppression'
import { readOutreachUnsubscribeToken } from './unsubscribe-token'

export interface OutreachRouteDeps {
  admin: () => ServiceRoleClient
  env: Record<string, string | undefined>
}

export type OutreachUnsubscribeOutcome = 'done' | 'invalid' | 'unavailable'

/** Verify the token, then add the address it names to the one suppression list. */
export async function unsubscribeByToken(token: unknown, deps: OutreachRouteDeps): Promise<OutreachUnsubscribeOutcome> {
  const email = readOutreachUnsubscribeToken(token, deps.env)
  if (!email) return 'invalid'
  try {
    const result = await suppress(deps.admin(), {
      email,
      source: 'unsubscribe_link',
      channel: 'outbound_prospect',
    })
    return result.status === 'ok' ? 'done' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'referrer-policy': 'no-referrer',
  'x-robots-tag': 'noindex, nofollow',
}

const COPY = {
  done: {
    title: 'You are unsubscribed',
    body: 'We have removed your address and will not write to you again. This applies to every kind of email we send, not only this one.',
  },
  invalid: {
    title: 'This link is not valid',
    body: 'The link may have been altered in transit. Reply to the message you received with the word "no" and we will remove you by hand.',
  },
  unavailable: {
    title: 'Something went wrong',
    body: 'We could not record your request just now. Please try the link again in a few minutes, or reply to the message with the word "no".',
  },
} as const

export function unsubscribePage(outcome: OutreachUnsubscribeOutcome): string {
  const { title, body } = COPY[outcome]
  return `<!doctype html>
<html lang="en" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title></head>
<body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#0a1b3d;">
<main style="max-width:480px;margin:12vh auto 0;padding:0 16px;">
<div style="background:#fff;border:1px solid #e3e9f2;border-radius:14px;padding:28px 24px;">
<h1 style="margin:0 0 12px;font-size:22px;">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.6;">${body}</p>
</div>
</main>
</body></html>`
}

/** The whole route: the token decides, and the answer is always a page, never a redirect. */
export async function handleOutreachUnsubscribe(request: Request, deps: OutreachRouteDeps): Promise<Response> {
  let token: string | null = null
  try {
    token = new URL(request.url).searchParams.get('t')
  } catch {
    token = null
  }
  const outcome = await unsubscribeByToken(token, deps)
  return new Response(unsubscribePage(outcome), {
    status: outcome === 'invalid' ? 400 : outcome === 'unavailable' ? 503 : 200,
    headers: HEADERS,
  })
}
