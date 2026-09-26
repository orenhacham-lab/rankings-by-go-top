/**
 * /content/search-console — Search Console recommendations, data and connection.
 *
 * Gated by the client-side NEXT_PUBLIC_GSC_READ_ONLY_ENABLED mirror, the same flag
 * that used to hide the in-page tab; the server routes independently re-check the
 * authoritative GSC_READ_ONLY_ENABLED flag.
 */

import SearchConsoleScreen from '@/components/content/workspace/SearchConsoleScreen'

export default function ContentSearchConsolePage() {
  if (process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED !== 'true') {
    return (
      <div className="py-20 text-center text-slate-400 dark:text-slate-500 text-sm">
        Not available.
      </div>
    )
  }

  return <SearchConsoleScreen />
}
