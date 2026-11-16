/**
 * THE SPELLING OF THE SEARCH CONSOLE READ PATHS, in a module with no 'use
 * client' on it.
 *
 * The widgets' shared reader (components/gsc/gsc-data.ts) is a client module,
 * so every export of it is a client reference: the dashboard layout, a server
 * component, cannot call one. It needs the status path, because it builds that
 * answer itself and hands it to the widgets keyed by the URL they would have
 * fetched. Keeping the spelling here lets both sides use the same one, which is
 * the whole point — a seeded answer under a different URL is an answer nobody
 * reads.
 */
export function gscStatusUrl(projectId: string): string {
  return `/api/gsc/status?projectId=${encodeURIComponent(projectId)}`
}

export type GscMetricsView = 'pages' | 'keywords' | 'trend'

export function gscMetricsUrl(projectId: string, view: GscMetricsView): string {
  return `/api/gsc/metrics?projectId=${encodeURIComponent(projectId)}&window=28&view=${view}`
}
