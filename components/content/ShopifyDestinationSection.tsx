'use client'

/**
 * The publishing DESTINATION control — "which blog do my articles go to?" —
 * as ONE component shared by every Shopify card.
 *
 * PRODUCTION INCIDENT. This block lived only inside ShopifyConnectionPanel,
 * which the Content Hub renders ONLY while `activePlatform === 'none'`. Once a
 * merchant is connected, the hub renders ContentHubPlatformCard instead — and
 * that card had no destination UI at all. So the merchant whose queue was
 * blocked on "choose a default blog" was looking at the one Shopify card that
 * could not show them a blog. Extracting it here is what makes the two cards
 * incapable of drifting apart again: there is one implementation, and both
 * render it.
 *
 * States, all of them visible and localized:
 *   loading         a spinner, never a premature "no blog"
 *   lookup failed   an explicit temporary-failure line + a Retry button. NEVER
 *                   collapsed into "your store has no blog" — that would be a
 *                   false statement about the merchant's store during an outage.
 *   zero blogs      a truthful explanation (create one in Shopify)
 *   exactly one     stated as automatically selected — no action demanded,
 *                   because the server resolves and saves it on first publish
 *   several         a selector + Save, and a note while none is chosen
 *   missing scope   explained in words ABOVE the control; the destination stays
 *                   visible and manageable either way (the two are different
 *                   questions: MAY we publish, and WHERE would we publish)
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Blog = { id: string; title: string; handle: string }
type LoadState = 'loading' | 'loaded' | 'error'

export default function ShopifyDestinationSection({
  projectId, canPublish, defaultBlogId, onSaved,
}: {
  projectId: string
  /** write_content granted. Explained when false; never hides this section. */
  canPublish: boolean
  /** The connection's saved default, or null. */
  defaultBlogId: string | null
  /** Called after a successful save so the parent can refresh the connection. */
  onSaved?: () => void
}) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.shopify, [language])

  const [state, setState] = useState<LoadState>('loading')
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [selected, setSelected] = useState<string>(defaultBlogId ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setState('loading'); setMessage(null)
    try {
      const res = await fetch(`/api/shopify/blogs?projectId=${projectId}`)
      const data = await res.json().catch(() => ({}))
      // A non-ok response is an OUTAGE, not an empty store. Distinguishing the
      // two is the whole point of this state: the old code kept `blogs` at []
      // on failure and rendered "no blog found in the store".
      if (!res.ok || !Array.isArray(data.blogs)) { setState('error'); return }
      const list = data.blogs as Blog[]
      setBlogs(list)
      setState('loaded')
      // One blog → show it selected. Persisted server-side on the first
      // publish; Save here just makes it explicit and immediate.
      if (!defaultBlogId && list.length === 1) setSelected(list[0].id)
    } catch { setState('error') }
  }, [projectId, defaultBlogId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSelected((prev) => prev || (defaultBlogId ?? '')) }, [defaultBlogId])

  async function save() {
    setSaving(true); setMessage(null)
    try {
      const res = await fetch('/api/shopify/connection', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, defaultBlogId: selected || null }),
      })
      setMessage(res.ok ? { text: t.defaultBlogSaved, ok: true } : { text: t.defaultBlogError, ok: false })
      if (res.ok) onSaved?.()
    } catch { setMessage({ text: t.defaultBlogError, ok: false }) } finally { setSaving(false) }
  }

  return (
    <div data-testid="shopify-destination" className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.defaultBlogLabel}</label>

      {!canPublish && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">{t.defaultBlogNeedsScope}</p>
      )}

      {state === 'loading' && <p className="text-xs text-slate-400">{t.defaultBlogLoading}</p>}

      {state === 'error' && (
        <div className="space-y-1">
          <p className="text-xs text-amber-700 dark:text-amber-400">{t.defaultBlogLoadError}</p>
          <Button size="sm" variant="outline" onClick={load} data-testid="shopify-destination-retry">{t.defaultBlogRetry}</Button>
        </div>
      )}

      {state === 'loaded' && blogs.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.defaultBlogNone}</p>
      )}

      {state === 'loaded' && blogs.length === 1 && (
        <div className="text-sm text-slate-700 dark:text-slate-200">
          {blogs[0].title}
          <span className="ms-2 text-[11px] text-emerald-700 dark:text-emerald-400">{t.defaultBlogAuto}</span>
        </div>
      )}

      {state === 'loaded' && blogs.length > 1 && (
        <>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label={t.defaultBlogLabel}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          >
            <option value="">{t.defaultBlogSelect}</option>
            {blogs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          {!defaultBlogId && <p className="text-[11px] text-amber-700 dark:text-amber-400">{t.defaultBlogMissing}</p>}
        </>
      )}

      {state === 'loaded' && blogs.length >= 1 && (
        <Button size="sm" variant="outline" onClick={save} loading={saving} disabled={saving || (blogs.length > 1 && !selected)}>
          {t.defaultBlogSave}
        </Button>
      )}

      {message && <p className={`text-[11px] ${message.ok ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}
    </div>
  )
}
