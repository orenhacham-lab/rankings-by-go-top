'use client'

/**
 * Whether Search Console is switched on, as the SERVER decides it
 * (isGscReadOnlyEnabled, lib/gsc/config.ts), handed to the client once by the
 * dashboard layout.
 *
 * Before this, a widget learned that Search Console was off by asking
 * GET /api/gsc/status and reading its 404: one failed request, and one console
 * error, on every screen that shows a Search Console figure. The layout already
 * knows the answer when it renders, so a screen with Search Console off now asks
 * nothing at all. The NEXT_PUBLIC mirror of the flag is not used for this: it is
 * baked in at build time and can disagree with the server's own flag.
 *
 * Outside the provider (a test render, a page outside the dashboard) the answer
 * is unknown (null) and the widgets ask the route as before, which still answers
 * 404 when the feature is off, so nothing is shown that the server would refuse.
 */
import { createContext, useContext, type ReactNode } from 'react'

const GscFeatureContext = createContext<boolean | null>(null)

export function GscFeatureProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <GscFeatureContext.Provider value={enabled}>{children}</GscFeatureContext.Provider>
}

/** true / false as the server decided; null when no dashboard layout provided it. */
export function useGscEnabled(): boolean | null {
  return useContext(GscFeatureContext)
}
