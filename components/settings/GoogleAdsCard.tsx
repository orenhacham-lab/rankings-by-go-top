import { Megaphone } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { SECTION } from './anchors'

/**
 * Row 10: Google Ads, as it really is. The search volumes already come from
 * GoTop's own Ads account, so there is nothing to connect for them; connecting
 * a merchant's own account (their campaigns) is a different capability, not
 * built, and the card says so instead of offering a button that does nothing.
 */
export default function GoogleAdsCard({ t }: { t: DashboardDictionary['projectSettings'] }) {
  return (
    <div id={SECTION.googleAds} className="scroll-mt-20">
      <Card>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Megaphone size={18} aria-hidden className="text-action" />
            <h3 className="text-base font-semibold text-ink">{t.googleAds.title}</h3>
          </div>
          <Badge variant="success">{t.googleAds.status}</Badge>
        </div>
        <p className="text-copy text-body">{t.googleAds.body}</p>
        <p className="mt-2 text-caption text-muted">{t.googleAds.note}</p>
      </Card>
    </div>
  )
}
