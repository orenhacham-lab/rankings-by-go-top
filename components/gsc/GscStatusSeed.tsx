'use client'

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
 * (lib/gsc/status.ts) and renders this, which serves it through the widgets'
 * own shared read (`primeGscResponse`) as if the browser had just fetched it.
 * The status then costs no wave at all and the metrics start with everything
 * else.
 *
 * It renders nothing and primes during render, not in an effect, because a
 * widget's first render reads the shared answer synchronously: an effect would
 * run after the widget had already started its own request.
 *
 * An answer for a project the visitor is not actually looking at is simply
 * never read: the shared store is keyed by URL, and a widget for another
 * project asks the route exactly as before.
 */
import { primeGscResponse, type GscResponse } from './gsc-data'

export default function GscStatusSeed({ url, response }: { url: string; response: GscResponse }) {
  primeGscResponse(url, response)
  return null
}
