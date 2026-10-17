/**
 * Which site a new account is about, for the operator's signup email.
 *
 * In order of trust:
 *   1. the free check's claim (the claim cookie → the scan row it names, looked
 *      up without redeeming it): the site the visitor scanned before signing up;
 *   2. the signup metadata's own `website` field, when a form carries one;
 *   3. the account's first project, once one exists.
 *
 * The project that the claim leads to is created AFTER sign-in, by the
 * new-project screen, so the claim is the earliest place the site is known;
 * the callback therefore resolves it here and sends the email once the
 * default client step has run. Service-role reads are filtered by the claim's
 * hash or the verified user id. Never throws: no site is a valid answer.
 */
import type { User } from '@supabase/supabase-js'
import { peekSeedClaim } from '@/lib/onboarding/claim-peek'
import { readClaimToken } from '@/lib/onboarding/claim-cookie'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { safeDomain } from './operator-alerts'
import type { SignupSite } from './signup-email'

export async function resolveSignupSite(args: {
  user: Pick<User, 'id' | 'user_metadata'>
  claimCookie: string | null | undefined
  admin: ServiceRoleClient
  now?: Date
}): Promise<SignupSite> {
  const none: SignupSite = { domain: null, source: null }
  try {
    const token = readClaimToken(args.claimCookie)
    if (token) {
      const peek = await peekSeedClaim(args.admin, token, args.now ?? new Date())
      const domain = peek.state === 'usable' ? safeDomain(peek.domain) : null
      if (domain) return { domain, source: 'claim' }
    }
    const meta = (args.user.user_metadata ?? {}) as Record<string, unknown>
    const fromForm = safeDomain(meta.website ?? meta.target_domain ?? meta.domain)
    if (fromForm) return { domain: fromForm, source: 'signup_form' }

    const first = await args.admin
      .from('projects')
      .select('target_domain')
      .eq('user_id', args.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
    const project = safeDomain((first.data as { target_domain?: unknown }[] | null)?.[0]?.target_domain)
    if (project) return { domain: project, source: 'first_project' }
  } catch {
    /* best effort */
  }
  return none
}
