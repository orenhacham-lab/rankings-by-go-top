'use client'

import { MapPin, Search } from 'lucide-react'
import Badge from './Badge'
import ChangeArrow, { ChangeSign } from './ChangeArrow'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export function ActiveBadge({ active }: { active: boolean }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      {active ? dict.common.active : dict.common.inactive}
    </Badge>
  )
}

export function ScanStatusBadge({ status }: { status: string }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)

  const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
    completed: { variant: 'success', label: dict.scans.status.completed },
    running: { variant: 'info', label: dict.scans.status.running },
    pending: { variant: 'warning', label: dict.scans.status.pending },
    failed: { variant: 'danger', label: dict.scans.status.failed },
  }
  const cfg = map[status] || { variant: 'neutral', label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function EngineBadge({ engine, device }: { engine: string; device?: string | null }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)

  if (engine === 'google_search') {
    let label: string
    if (device === 'mobile') {
      label = dict.common.searchTypeGoogleMobile
    } else {
      label = dict.common.searchTypeGoogleDesktop
    }
    return <Badge variant="info">{label}</Badge>
  }
  if (engine === 'google_maps') {
    return <Badge variant="success">{dict.common.engineGoogleMaps}</Badge>
  }
  return <Badge>{engine}</Badge>
}

/**
 * A ranking's move since the previous check: a lucide arrow and the number of
 * places, green up (better) and red down, a muted dash-line when it held.
 * Positive `change` = improved (a lower position number).
 */
export function PositionChange({ change }: { change: number | null }) {
  if (change === null) return <span className="text-muted">—</span>
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  return (
    <span
      data-position-change={direction}
      className={cn(
        'inline-flex items-center gap-0.5 text-copy font-semibold tabular-nums',
        direction === 'up' && 'text-ok',
        direction === 'down' && 'text-bad',
        direction === 'flat' && 'font-normal text-muted'
      )}
    >
      <ChangeArrow direction={direction} />
      <ChangeSign direction={direction} />
      {direction === 'flat' ? <span className="sr-only">0</span> : Math.abs(change)}
    </span>
  )
}

/**
 * The engine as a quiet line (an icon and its words), for a table where every row
 * has one: a coloured badge on each row was noise that competed with the positions.
 */
export function EngineLabel({ engine, device }: { engine: string; device?: string | null }) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const maps = engine === 'google_maps'
  const label = maps
    ? dict.common.engineGoogleMaps
    : engine === 'google_search'
      ? (device === 'mobile' ? dict.common.searchTypeGoogleMobile : dict.common.searchTypeGoogleDesktop)
      : engine
  const Icon = maps ? MapPin : Search
  return (
    <span data-engine={engine} className="inline-flex items-center gap-1.5 text-caption text-muted">
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-control bg-sunk text-body ring-1 ring-inset ring-line">
        <Icon className="size-3.5" strokeWidth={2} />
      </span>
      {label}
    </span>
  )
}
