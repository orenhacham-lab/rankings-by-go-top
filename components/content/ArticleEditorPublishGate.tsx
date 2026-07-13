'use client'

/**
 * Phase 4F.1 — platform gate for the article editor's PUBLISHING controls.
 *
 * Derives the active platform from the project connection state (never from a
 * WordPress post id) and renders exactly one:
 *   - WordPress connected → the WordPress publishing subtree (children), unchanged.
 *   - Shopify connected    → a compact informational card (Shopify publishing is
 *                            a later phase; NO fake/disabled CTA).
 *   - Neither              → a compact "connect a platform on the project page".
 *   - Both                 → a configuration-conflict warning (no publish flow).
 *
 * UI-only: hides WordPress controls in non-WordPress projects rather than
 * rendering them disabled. No publishing behavior changes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ArticleEditorPublishGate({ projectId, children }: { projectId: string | null; children: React.ReactNode }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => getDashboardDictionary(language).contentHub.editor.publishGate, [language])
  const dir: 'rtl' | 'ltr' = language === 'he' ? 'rtl' : 'ltr'

  const [loading, setLoading] = useState(true)
  const [wpConnected, setWpConnected] = useState(false)
  const [shopifyConnected, setShopifyConnected] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) { setLoading(false); return }
    try {
      const [wpRes, shRes] = await Promise.all([
        fetch(`/api/wordpress/connection?projectId=${projectId}`),
        fetch(`/api/shopify/connection?projectId=${projectId}`),
      ])
      const wp = wpRes.ok ? await wpRes.json().catch(() => ({})) : {}
      const sh = shRes.ok ? await shRes.json().catch(() => ({})) : {}
      setWpConnected(!!wp.connection)
      setShopifyConnected(!!sh.connection)
    } catch { /* leave both false */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Wait for detection so WordPress controls never flash in a Shopify project.
  if (loading) {
    return (
      <Card className="hover:translate-y-0">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-3">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    )
  }

  // Both connected → conflict; never render a publishing flow.
  if (wpConnected && shopifyConnected) {
    return (
      <Card className="hover:translate-y-0 border-amber-300 dark:border-amber-700" >
        <div className="flex items-start gap-2" dir={dir}>
          <AlertTriangle size={18} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-amber-800 dark:text-amber-300">{t.conflictTitle}</div>
            <p className="text-sm text-amber-800/90 dark:text-amber-300/90">{t.conflictText}</p>
            <Link href={`/projects/${projectId}`} className="inline-block mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{t.projectPageLink}</Link>
          </div>
        </div>
      </Card>
    )
  }

  // WordPress connected → the existing WordPress publishing subtree, unchanged.
  if (wpConnected) return <>{children}</>

  // Shopify connected → informational card only (no fake/disabled CTA).
  if (shopifyConnected) {
    return (
      <Card className="hover:translate-y-0" >
        <div dir={dir}>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">{t.shopifyTitle}</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">{t.shopifyText}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t.shopifySecondary}</p>
        </div>
      </Card>
    )
  }

  // Neither connected → direct the user to connect on the project page.
  return (
    <Card className="hover:translate-y-0" >
      <div dir={dir}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t.neitherText}</p>
        {projectId && <Link href={`/projects/${projectId}`} className="inline-block mt-2 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">{t.projectPageLink}</Link>}
      </div>
    </Card>
  )
}
