import { Megaphone } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { SECTION } from './anchors'

/**
 * Google Ads, as it really is for a project: not a connection.
 *
 * The search volumes come from Go Top's own data source (an app-level Ads key,
 * lib/google-ads), the same for every project, so there is nothing of the
 * project's to connect. A per-project Ads connection is not built. The row is
 * therefore drawn like the GA4 row (a quiet "not available yet" panel) and it
 * takes no connection state at all: it cannot say "connected" or "active",
 * whatever project it is shown for (lib/project-settings/__qa__/settings-screen.qa.ts).
 */
export default function GoogleAdsCard({ t }: { t: DashboardDictionary['projectSettings'] }) {
  return (
    <div id={SECTION.googleAds} className="scroll-mt-20">
      <Card tone="sunk" className="flex items-start gap-3">
        <Megaphone size={16} aria-hidden className="mt-0.5 shrink-0 text-muted" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{t.googleAds.title}</p>
          <p className="mt-0.5 text-sm text-muted">{t.googleAds.body}</p>
          <p className="mt-1 text-sm text-muted">{t.googleAds.note}</p>
        </div>
      </Card>
    </div>
  )
}
