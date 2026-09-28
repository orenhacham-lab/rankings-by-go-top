/**
 * Every place the onboarding screens send a merchant, built in one spot.
 *
 * Each is an internal path this app serves. The only `next` any of them
 * carries is a path we built ourselves, and the sign-in screen sanitises it
 * again, so nothing here can point at another site.
 *
 * The research summary lives at /projects/{id}/summary, under the project,
 * and carries ?projectId= so the workspace switcher adopts that project too
 * (the active-project provider reloads its list once for a project created a
 * moment ago). Other screens link to it with summaryHref.
 */

const enc = encodeURIComponent

export function summaryHref(projectId: string): string {
  return `/projects/${enc(projectId)}/summary?projectId=${enc(projectId)}`
}

export function dashboardHref(projectId: string): string {
  return `/dashboard?projectId=${enc(projectId)}`
}

/**
 * The settings sections the summary's "Edit" opens: what the business is, its
 * audiences, its competitors. The settings screen owns the sections; these are
 * the anchors they are reached by.
 */
export const SUMMARY_EDIT_ANCHORS = {
  business: 'business',
  audiences: 'audiences',
  competitors: 'competitors',
} as const
export type SummaryEditSection = keyof typeof SUMMARY_EDIT_ANCHORS

export function settingsHref(projectId: string, section?: SummaryEditSection): string {
  const base = `/settings?projectId=${enc(projectId)}`
  return section ? `${base}#${SUMMARY_EDIT_ANCHORS[section]}` : base
}

export const BILLING_HREF = '/billing'
export const CLIENTS_HREF = '/clients'
export const NEW_PROJECT_HREF = '/projects/new'

/** The sign-in screen, returning to `path` afterwards. Only an internal path is ever passed on. */
export function signInHref(path: string): string {
  const safe = path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/dashboard'
  return `/login?next=${enc(safe)}`
}

/** An article the first-article button wrote. */
export function articleHref(articleId: string): string {
  return `/content/articles/${enc(articleId)}`
}

/**
 * Go Top's WhatsApp support line (the same number as the sidebar's support row),
 * for "talk to us" when a scan could not read the site. The one external link
 * here: a fixed address, never built from input.
 */
export const SUPPORT_WHATSAPP_HREF =
  'https://wa.me/972549489377?text=%D7%94%D7%99%D7%99%2C%20%D7%90%D7%A0%D7%99%20%D7%A6%D7%A8%D7%99%D7%9A%20%D7%AA%D7%9E%D7%99%D7%9B%D7%94'

/** A stage-A failure the site itself caused, where a retry alone leads nowhere: offer the ways around it. */
export const FAILURES_WITH_WAYS_AROUND = ['siteForbidden'] as const
