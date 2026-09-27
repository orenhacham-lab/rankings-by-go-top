/**
 * What a Search Console widget can show, decided once from GET /api/gsc/status.
 *
 * Search Console is not a screen of its own any more: it feeds the dashboard, the
 * keywords table, "my progress" and topics. Every widget that reads it is always on
 * its screen with its real title, and when the data is not there it says what will
 * appear and offers exactly one way to fix that. Which fix depends on WHY the data is
 * missing, and that reason is decided here, once, so the widgets cannot disagree
 * about it.
 *
 * The one exception is Search Console switched off on the server ('disabled'): there
 * is nothing a merchant can do about that, and every route that would connect it
 * refuses too, so every widget renders nothing at all and its screen looks as it did
 * before Search Console fed it.
 *
 * Pure: no React, no I/O.
 */
import { SETTINGS_GSC_ANCHOR, settingsGscHref } from '@/lib/content/content-hub-setup'

/** Why a widget has no data, each with its own single action. */
export type GscSetupState = 'not_connected' | 'reauth_required' | 'no_property' | 'never_synced'

export const GSC_SETUP_STATES: readonly GscSetupState[] = ['not_connected', 'reauth_required', 'no_property', 'never_synced']

/** The authoritative property-level figures of the latest 28-day sync. */
export interface GscSummary28 {
  clicks: number
  impressions: number
  ctr: number
  avgPosition: number | null
  startDate: string | null
  endDate: string | null
}

export type GscStatusView =
  | { state: 'loading' }
  | { state: 'error' }
  /** Search Console is switched off on the server: the widget renders nothing. */
  | { state: 'disabled' }
  | { state: GscSetupState }
  /** `summary` is null when the latest sync predates the property summary: its rows are
   *  still good, but its totals need one more sync (never summed from detail rows). */
  | { state: 'ready'; summary: GscSummary28 | null }

export function isGscSetupState(state: string): state is GscSetupState {
  return (GSC_SETUP_STATES as readonly string[]).includes(state)
}

type StatusBody = {
  ok?: boolean
  connection?: { status?: string } | null
  property?: unknown
  windows?: Record<string, {
    summaryResyncRequired?: boolean
    clicks?: number | null
    impressions?: number | null
    ctr?: number | null
    avgPosition?: number | null
    startDate?: string | null
    endDate?: string | null
  } | null>
}

/**
 * The status response → what the widgets show.
 *
 * A 404 means the Search Console feature is off on the server (GSC_READ_ONLY_ENABLED):
 * the connect routes refuse too, so offering "connect" would be a dead end. It is
 * 'disabled', and the widgets render nothing. Any other failure is an error, never a
 * setup state: a read that failed must not tell a connected merchant to connect.
 */
export function gscStatusView(httpStatus: number, body: unknown): GscStatusView {
  if (httpStatus === 404) return { state: 'disabled' }
  const b = (body ?? {}) as StatusBody
  if (httpStatus < 200 || httpStatus >= 300 || b.ok !== true) return { state: 'error' }

  const connection = b.connection ?? null
  if (!connection || connection.status === 'revoked') return { state: 'not_connected' }
  const reauth = connection.status === 'reauth_required'
  if (!b.property) return { state: reauth ? 'reauth_required' : 'no_property' }

  const run = b.windows?.['28'] ?? null
  if (!run) return { state: reauth ? 'reauth_required' : 'never_synced' }
  if (run.summaryResyncRequired || run.clicks === null || run.clicks === undefined) return { state: 'ready', summary: null }
  return {
    state: 'ready',
    summary: {
      clicks: Number(run.clicks),
      impressions: Number(run.impressions ?? 0),
      ctr: Number(run.ctr ?? 0),
      avgPosition: run.avgPosition === null || run.avgPosition === undefined ? null : Number(run.avgPosition),
      startDate: run.startDate ?? null,
      endDate: run.endDate ?? null,
    },
  }
}

/**
 * Where every widget's one button goes: the Search Console section of the project's
 * settings, which owns the connection. A fixed internal path; the project rides along
 * so the link opens the project the widget was showing.
 */
export function gscSettingsHref(projectId: string | null | undefined): string {
  return projectId ? settingsGscHref(projectId) : `/settings#${SETTINGS_GSC_ANCHOR}`
}
