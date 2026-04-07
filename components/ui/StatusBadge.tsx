import Badge from './Badge'

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'success' : 'neutral'}>
      {active ? 'פעיל' : 'לא פעיל'}
    </Badge>
  )
}

export function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
    completed: { variant: 'success', label: 'הושלם' },
    running: { variant: 'info', label: 'רץ...' },
    pending: { variant: 'warning', label: 'ממתין' },
    failed: { variant: 'danger', label: 'נכשל' },
  }
  const cfg = map[status] || { variant: 'neutral', label: status }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>
}

export function EngineBadge({ engine, label }: { engine: string; label?: string }) {
  if (engine === 'google_search') {
    return <Badge variant="info">{label || 'גוגל חיפוש'}</Badge>
  }
  if (engine === 'google_maps') {
    return <Badge variant="success">{label || 'גוגל מפות'}</Badge>
  }
  return <Badge>{label || engine}</Badge>
}

export function PositionChange({ change }: { change: number | null }) {
  if (change === null) return <span className="text-slate-400">—</span>
  if (change > 0) {
    return (
      <span className="text-green-600 font-semibold text-sm">
        ▲ {change}
      </span>
    )
  }
  if (change < 0) {
    return (
      <span className="text-red-600 font-semibold text-sm">
        ▼ {Math.abs(change)}
      </span>
    )
  }
  return <span className="text-slate-400 text-sm">=</span>
}
