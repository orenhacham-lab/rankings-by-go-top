import { Newspaper, ShoppingBag, LayoutTemplate, Webhook, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChoosablePlatform } from '@/lib/site-platforms/types'

const ICONS: Record<ChoosablePlatform, LucideIcon> = {
  wordpress: Newspaper,
  shopify: ShoppingBag,
  wix: LayoutTemplate,
  webhook: Webhook,
}

/** The platform's mark, on the app's own action tint (no third-party logos). */
export default function PlatformIcon({ platform, size = 'md', className }: { platform: ChoosablePlatform; size?: 'sm' | 'md'; className?: string }) {
  const Icon = ICONS[platform]
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-inset bg-action-soft text-action',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
    >
      <Icon className={size === 'sm' ? 'size-4' : 'size-5'} strokeWidth={2} />
    </span>
  )
}
