'use client'

/**
 * Content & Articles section — project page module.
 *
 * Phase 4F.1 UX: a project uses ONE primary platform. This section derives the
 * active platform from the existing connection tables (no migration) and shows
 * exactly one of: platform choice (neither connected), the WordPress panel, the
 * Shopify panel, or a configuration-conflict warning (both connected). Server-
 * side exclusivity is enforced in the connection routes — this is the UI half.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Newspaper, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import WordPressConnectionPanel from './WordPressConnectionPanel'
import ShopifyConnectionPanel from './ShopifyConnectionPanel'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ContentSection({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection, [language])

  // K1 — a clean connection success from the project page drops the user straight
  // into the Content Hub for this project (validated internal path; no open redirect).
  const goToContentHub = useCallback(() => {
    router.push(`/content?projectId=${encodeURIComponent(projectId)}`)
  }, [router, projectId])

  const [loading, setLoading] = useState(true)
  const [wpConnected, setWpConnected] = useState(false)
  const [shopifyConnected, setShopifyConnected] = useState(false)
  // When neither platform is connected, which one the user chose to connect.
  const [choice, setChoice] = useState<'wordpress' | 'shopify' | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [wpRes, shRes] = await Promise.all([
        fetch(`/api/wordpress/connection?projectId=${projectId}`),
        fetch(`/api/shopify/connection?projectId=${projectId}`),
      ])
      const wp = wpRes.ok ? await wpRes.json().catch(() => ({})) : {}
      const sh = shRes.ok ? await shRes.json().catch(() => ({})) : {}
      const wpc = !!wp.connection
      const shc = !!sh.connection
      setWpConnected(wpc)
      setShopifyConnected(shc)
      // Returning to the neither-connected state resets to the platform choice.
      if (!wpc && !shc) setChoice(null)
    } catch {
      /* leave as-is; panels still render on demand */
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { refresh() }, [refresh])

  // Returning from a Shopify OAuth attempt (?shopify=connected|warning|error)
  // opens the Shopify view so its panel shows the result + a re-entry field
  // (instead of a silent platform-choice screen). No-op when already connected.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('shopify')) setChoice('shopify')
  }, [])

  const stats = [
    { label: t.statsDrafts, value: 0 },
    { label: t.statsReady, value: 0 },
    { label: t.statsScheduled, value: 0 },
    { label: t.statsPublished, value: 0 },
  ]

  const both = wpConnected && shopifyConnected

  // K2 — when a platform is connected, explain what the Content Hub offers and link
  // to it. This is a pointer to the hub, NOT a second Content Hub inside the project.
  const connectedBanner = (
    <Card className="hover:translate-y-0 border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-900/10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800 dark:text-slate-100">{t.connectedTitle}</div>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{t.connectedBody}</p>
        </div>
        <Button size="sm" onClick={goToContentHub} className="shrink-0">{t.goToContentHub}</Button>
      </div>
    </Card>
  )

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Newspaper size={20} strokeWidth={2} className="text-indigo-600 dark:text-indigo-400" />
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{t.title}</h2>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.subtitle}</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <Card key={s.label} className="hover:translate-y-0" padding={false}>
            <div className="p-4">
              <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{s.label}</div>
              <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{s.value}</div>
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <Card className="hover:translate-y-0">
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-3">
            <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </Card>
      ) : both ? (
        // Unexpected dual connection — surface a conflict, delete nothing. Both
        // panels render so the owner can disconnect one to resolve it.
        <div className="space-y-3">
          <Card className="hover:translate-y-0 border-amber-300 dark:border-amber-700">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-amber-800 dark:text-amber-300">{t.conflictTitle}</div>
                <p className="text-sm text-amber-800/90 dark:text-amber-300/90">{t.conflictBody}</p>
              </div>
            </div>
          </Card>
          <WordPressConnectionPanel projectId={projectId} onChanged={refresh} />
          <ShopifyConnectionPanel projectId={projectId} onChanged={refresh} />
        </div>
      ) : wpConnected ? (
        <div className="space-y-3">
          {connectedBanner}
          <WordPressConnectionPanel projectId={projectId} onChanged={refresh} />
        </div>
      ) : shopifyConnected ? (
        <div className="space-y-3">
          {connectedBanner}
          <ShopifyConnectionPanel projectId={projectId} onChanged={refresh} />
        </div>
      ) : choice === 'wordpress' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">← {t.back}</button>
          <WordPressConnectionPanel projectId={projectId} onChanged={refresh} onConnected={goToContentHub} />
        </div>
      ) : choice === 'shopify' ? (
        <div className="space-y-2">
          <button type="button" onClick={() => setChoice(null)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">← {t.back}</button>
          <ShopifyConnectionPanel projectId={projectId} onChanged={refresh} />
        </div>
      ) : (
        // Neither connected → platform choice (never both full panels at once).
        <Card className="hover:translate-y-0">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">{t.platformChoiceTitle}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t.platformChoiceHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setChoice('wordpress')}>{t.connectWordPress}</Button>
            <Button size="sm" variant="outline" onClick={() => setChoice('shopify')}>{t.connectShopify}</Button>
          </div>
        </Card>
      )}
    </section>
  )
}
