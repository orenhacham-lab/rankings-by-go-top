/**
 * THE LANGUAGE RECORDED ON AN ACCOUNT, and the two places it is written.
 *
 * Every customer email is written in `user_metadata.locale`'s language
 * (lib/reminders/recipient.ts). Only ONE door ever wrote that value: the
 * email-and-password signup form, which puts the route's language in
 * `signUp({ options: { data: { locale } } })`. A GOOGLE sign-up writes no
 * metadata of its own, so those accounts carried no language at all and every
 * email to them fell through to the fallback — Hebrew. It happened in
 * Production: the Digistore24 buyer who signed in with Google on 2026-11-14 was
 * sent a Hebrew setup email on 2026-11-18 about their own .com.ph site.
 *
 * SO THE CALLBACK WRITES IT. `app/api/auth/callback/route.ts` is the funnel
 * every sign-in door reaches — email confirmation, Supabase OAuth, the site's
 * own Google client — and the only one of them that still holds the language
 * the visitor was using, because `lang` rides on the redirect through each hop.
 * That is the same reason the signup country is written there
 * (lib/compliance/signup-country.ts).
 *
 * WRITE-ONCE, AND NEVER OVER A RECORDED CHOICE. A customer who switched the
 * dashboard to another language has said what their language is
 * (`app/api/account/language/route.ts` records that), and a later sign-in from a
 * link in some other language must not undo it. So this writes only when the
 * account has NO language recorded — which also means an older account without
 * one is repaired the next time its owner signs in, rather than only new ones.
 *
 * IT IS NOT A COUNTRY, A MARKET OR A PRICE. The value is the language of words,
 * nothing else. lib/billing/server-market.ts says why a market may never be read
 * from it.
 */
import { normalizeStoredLocale, type PublicLocale } from './locales'

/** What the write did, for the log line and for the suites. */
export type AccountLocaleOutcome = 'written' | 'already_recorded' | 'no_language' | 'failed'

/** The slice of the service-role client this needs, so a suite can hand it a fake. */
export interface AccountLocaleAdmin {
  auth: {
    admin: {
      updateUserById: (
        userId: string,
        attrs: { user_metadata: Record<string, unknown> },
      ) => Promise<{ error: unknown }>
    }
  }
}

/**
 * Record the language this sign-in was made in, if the account has none.
 *
 * `currentLocale` is the account's metadata value as read from the verified user
 * record; `lang` is the language the request carried. An unsupported or missing
 * `lang` writes nothing — a language that is not published cannot be the one the
 * email is written in.
 */
export async function recordAccountLocale(input: {
  admin: AccountLocaleAdmin
  userId: string
  currentLocale: unknown
  lang: string | null
}): Promise<AccountLocaleOutcome> {
  if (normalizeStoredLocale(input.currentLocale)) return 'already_recorded'
  const locale: PublicLocale | null = normalizeStoredLocale(input.lang)
  if (!locale) return 'no_language'
  try {
    // `user_metadata` MERGES on the Supabase side, so the name, the phone and the
    // consent flag the signup form wrote are kept; only `locale` is added.
    const { error } = await input.admin.auth.admin.updateUserById(input.userId, { user_metadata: { locale } })
    return error ? 'failed' : 'written'
  } catch {
    return 'failed'
  }
}

/**
 * Record the language the OWNER chose in the app, overwriting whatever was there.
 *
 * This is the one write that is allowed to replace a recorded value, because it
 * is the customer saying what their language is. The switcher used to write only
 * a cookie and localStorage — neither of which a cron can read — so a customer
 * who moved the dashboard to Spanish kept receiving Hebrew email for ever.
 */
export async function setAccountLocale(input: {
  admin: AccountLocaleAdmin
  userId: string
  locale: PublicLocale
}): Promise<'written' | 'failed'> {
  try {
    const { error } = await input.admin.auth.admin.updateUserById(input.userId, { user_metadata: { locale: input.locale } })
    return error ? 'failed' : 'written'
  } catch {
    return 'failed'
  }
}

/** What the route needs. A suite hands it a fake user and a fake admin. */
export interface AccountLanguageRouteDeps {
  userId: () => Promise<string | null>
  admin: () => AccountLocaleAdmin
}

/**
 * PUT /api/account/language — the signed-in owner's language, from the switcher.
 *
 * `proxy.ts`'s matcher excludes `/api/*`, so this route authenticates itself
 * (CLAUDE.md). An unsupported language is a 400 rather than a silent write: a
 * value this product does not publish cannot be the one an email is written in.
 */
export async function handleAccountLanguagePut(request: Request, deps: AccountLanguageRouteDeps): Promise<Response> {
  const userId = await deps.userId()
  if (!userId) return Response.json({ error: 'unauthorized' }, { status: 401 })
  let body: unknown = null
  try { body = await request.json() } catch { body = null }
  const locale = normalizeStoredLocale((body as { locale?: unknown } | null)?.locale)
  if (!locale) return Response.json({ error: 'unsupported_locale' }, { status: 400 })
  const outcome = await setAccountLocale({ admin: deps.admin(), userId, locale })
  if (outcome === 'failed') return Response.json({ error: 'not_saved' }, { status: 503 })
  return Response.json({ ok: true, locale })
}
