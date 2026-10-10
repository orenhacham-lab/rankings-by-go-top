/**
 * Which connections lead the settings screen.
 *
 * The connections (the publishing platform, then Search Console) sat near the
 * end of a long screen, under the business, the audiences, the competitors and
 * the article design, though nothing is published until the site is connected.
 * The owner asked for the ones not connected yet to come FIRST and to go back
 * to their usual place once connected (report of 10 October 2026).
 *
 * The order is decided ONCE, from the reads the screen makes as it opens, and
 * kept for that visit: a section that moved as soon as its connection succeeded
 * would jump away mid-flow (WordPress asks for an author and a category right
 * after connecting). The next visit finds it in its usual place.
 *
 * Only a connection KNOWN to be missing moves: a read that failed says nothing
 * about the connection, and Search Console switched off on the server is not
 * shown at all. A Search Console that is connected but has no property chosen
 * yet still needs the owner, so it moves too.
 *
 * Pure (lib/project-settings/__qa__/connect-first.qa.ts).
 */
import { projectConnectionsFrom } from '@/lib/connection-status/project-connections'
import type { ReadResponse } from '@/lib/connection-status/known'
import { gscStatusView } from '@/lib/gsc/widget-state'

export interface ConnectFirst {
  /** The publishing platform (WordPress, Shopify, Wix, another site) is not connected. */
  platform: boolean
  /** Search Console is not connected, or no property is chosen yet. */
  gsc: boolean
}

export const CONNECT_FIRST_NONE: ConnectFirst = { platform: false, gsc: false }

export function connectFirst(r: {
  wordpress: ReadResponse | null | undefined
  shopify: ReadResponse | null | undefined
  site: ReadResponse | null | undefined
  /** null when Search Console is off for this screen (never asked). */
  gsc: ReadResponse | null | undefined
}): ConnectFirst {
  const known = projectConnectionsFrom({ wordpress: r.wordpress, shopify: r.shopify, site: r.site })
  const platform = known.state === 'ready'
    && !known.value.wordpress && !known.value.shopify && !known.value.site && !known.value.wordpressPlugin
  const gscView = r.gsc ? gscStatusView(r.gsc.status, r.gsc.body) : null
  const gsc = !!gscView && (gscView.state === 'not_connected' || gscView.state === 'no_property')
  return { platform, gsc }
}
