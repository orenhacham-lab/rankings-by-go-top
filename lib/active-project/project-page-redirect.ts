/**
 * Where a link to the retired project page lands now.
 *
 * `/projects/{id}` was one page that held a project's keywords, AI visibility,
 * content connection and Search Console. Each of those is a tab of the workspace
 * now, so the page is a redirect. The address itself has to keep working: it is
 * the "Open dashboard" link of the Shopify app home, the return address of the
 * Shopify and Search Console connection flows, and every bookmark a merchant has.
 *
 * The rules, in order:
 *  1. A connection result (`shopify`, `gsc`, `gsc_error`) goes to the settings
 *     screen, which is where the panels that read and clear it are mounted now,
 *     straight to the section of the panel that shows it.
 *  2. A `section` deep link goes to the tab that owns that section.
 *  3. Anything else goes to the project's dashboard.
 *
 * Every other query parameter is carried over (`lang` above all: the Shopify
 * handoff is English-only and must stay English through the hop), and the
 * project is named by `projectId`, which the active-project provider adopts
 * only after validating it against the signed-in user's own projects.
 *
 * The destination path is always one of the fixed internal paths below; nothing
 * from the request is ever used as a path or a host, so this cannot redirect off
 * the site.
 */
import { PROJECT_CONNECTION_ANCHOR, SETTINGS_GSC_ANCHOR } from '@/lib/content/content-hub-setup'

export const PROJECT_PAGE_SECTION_PATHS: Readonly<Record<string, string>> = {
  'ai-visibility': '/ai-visibility',
  rankings: '/keywords',
  reports: '/keywords',
  content: '/settings',
}

/** A connection flow's result parameter, and the settings section whose panel shows it. */
const CONNECTION_RESULTS: ReadonlyArray<readonly [param: string, anchor: string]> = [
  ['shopify', PROJECT_CONNECTION_ANCHOR],
  ['gsc', SETTINGS_GSC_ANCHOR],
  ['gsc_error', SETTINGS_GSC_ANCHOR],
]

/** The old page's content section was the platform connection, a section of settings now. */
const SECTION_ANCHORS: Readonly<Record<string, string>> = { content: PROJECT_CONNECTION_ANCHOR }

/** Parameters that are consumed here and never forwarded. */
const CONSUMED_PARAMS = new Set(['section', 'projectId', 'project_id'])

type Query = Record<string, string | string[] | undefined>

function values(v: string | string[] | undefined): string[] {
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}

export function projectPageRedirect(projectId: string, query: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (CONSUMED_PARAMS.has(key)) continue
    for (const one of values(value)) params.append(key, one)
  }
  params.set('projectId', projectId)

  const section = values(query.section)[0] ?? ''
  const result = CONNECTION_RESULTS.find(([param]) => values(query[param]).length > 0)
  const [path, anchor] = result
    ? ['/settings', result[1]]
    : Object.prototype.hasOwnProperty.call(PROJECT_PAGE_SECTION_PATHS, section)
      ? [PROJECT_PAGE_SECTION_PATHS[section], SECTION_ANCHORS[section] ?? '']
      : ['/dashboard', '']

  return `${path}?${params.toString()}${anchor ? `#${anchor}` : ''}`
}
