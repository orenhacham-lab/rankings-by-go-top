/**
 * The trial bar's "hide for a day", shared by the dashboard layout (a server
 * component, which reads the cookie so a dismissed bar is never painted) and
 * components/layout/TrialBar.tsx (which writes it). A plain module: a server
 * component cannot call a function exported by a 'use client' module.
 */

/** The cookie (and the legacy localStorage key) holding the hide-until time, in ms. */
export const TRIAL_BAR_HIDE_COOKIE = 'trial-bar-hidden-until'

/** Whether a cookie value (the hide-until time, in ms) still hides the bar. */
export function trialBarDismissed(value: string | undefined | null, now = Date.now()): boolean {
  return Number(value || 0) > now
}
