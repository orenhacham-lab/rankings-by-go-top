/**
 * THE SEARCH CONSOLE STATUS, HANDED TO THE CLIENT INSTEAD OF ASKED FOR.
 *
 * Every Search Console widget asks for the status first, and the dashboard's
 * metrics are read only once that answer says "ready" — a real dependency, so
 * the two were two browser round trips, one behind the other, at the END of a
 * dashboard load (measured: the status started at 2147ms and the metrics at
 * 3647ms). Measured against production from Oren's browser on 16.11.2026,
 * `/api/version` — no auth, no database, no work — costs 510-650ms, so what a
 * wave costs is transport, not work, and removing one is worth about half a
 * second.
 *
 * The dashboard layout builds the same answer in its own region
 * (lib/gsc/status.ts) and renders this, which hands it to the widgets' shared
 * read as if the browser had just fetched it. The status then costs no wave at
 * all and the metrics start with everything else.
 *
 * IT IS A SCRIPT TAG, NOT A COMPONENT THAT PRIMES DURING RENDER. The first
 * version primed from render, which is already too late in two ways the
 * measurement on 16.11.2026 made plain: this sits in a Suspense boundary, which
 * React may hydrate in a later commit than the page's — after the page's
 * effects have fetched — and the store's module can be emitted into a second
 * chunk, in which case the layout's copy and the widget's copy are two Maps.
 * A script runs while the HTML is still being parsed, before any hydration,
 * and writes somewhere both chunks can see (lib/gsc/urls.ts).
 *
 * An answer for a project the visitor is not actually looking at is never read:
 * it is keyed by URL, and a widget for another project asks the route exactly
 * as before. Which project that is comes from the cookie the active-project
 * provider mirrors (lib/active-project/active-cookie.ts).
 */
import { gscSeedScript, type GscResponse } from '@/lib/gsc/urls'

export default function GscStatusSeed({ url, response }: { url: string; response: GscResponse }) {
  return (
    <script
      // The answer is this visitor's own, built for them a moment ago in the
      // same request; it is never cached or shared.
      dangerouslySetInnerHTML={{ __html: gscSeedScript(url, response.status, response.body) }}
    />
  )
}
