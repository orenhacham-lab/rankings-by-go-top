'use client'

/**
 * Phase 4E — compact WordPress publishing settings for the article editor.
 *
 * Loads categories + tags from the connected site (short-cached server-side),
 * lets the user pick one primary category, optional additional categories, and
 * optional tags (WordPress term IDs — never labels), and persists them on the
 * article via PATCH. Shows the detected SEO plugin and the taxonomy/SEO status
 * from the latest export. No editor redesign; terms are never auto-created.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

type Term = { id: number; name: string }
export type WpExportStatus = {
  seoPlugin?: string
  seoStatus?: string
  taxonomyWarning?: boolean
  invalidCategoryIds?: number[]
  invalidTagIds?: number[]
} | null

type Dict = {
  title: string; hint: string; loading: string; empty: string; permissionError: string
  connectionError: string; primaryCategory: string; primaryNone: string; additionalCategories: string
  tags: string; save: string; saving: string; saved: string; saveError: string
  seoPluginLabel: string; seoYoast: string; seoRankMath: string; seoNone: string; seoUnknown: string
  seoPermissionError: string; lastExportLabel: string; statusVerified: string
  statusWrittenNotVerifiable: string; statusPluginUnavailable: string; statusPermissionError: string
  statusExactFailure: string; taxonomyWarning: string
}

const listCls =
  'max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 space-y-1'
const selectCls =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function WordPressPublishSettings({
  projectId,
  articleId,
  dict,
  dir,
  initialPrimaryCategoryId,
  initialCategoryIds,
  initialTagIds,
  lastExport,
  onNotify,
}: {
  projectId: string
  articleId: string
  dict: Dict
  dir: 'rtl' | 'ltr'
  initialPrimaryCategoryId: number | null
  initialCategoryIds: number[]
  initialTagIds: number[]
  lastExport: WpExportStatus
  onNotify?: (text: string, ok: boolean) => void
}) {
  const t = dict
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<'permission' | 'connection' | null>(null)
  const [categories, setCategories] = useState<Term[]>([])
  const [tags, setTags] = useState<Term[]>([])
  const [seoPlugin, setSeoPlugin] = useState<string>('unknown')
  const [primary, setPrimary] = useState<number | null>(initialPrimaryCategoryId ?? null)
  const [catIds, setCatIds] = useState<number[]>(initialCategoryIds ?? [])
  const [tagIds, setTagIds] = useState<number[]>(initialTagIds ?? [])
  const [saving, setSaving] = useState(false)

  const notify = useCallback((text: string, ok: boolean) => onNotify?.(text, ok), [onNotify])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [catRes, tagRes, seoRes] = await Promise.all([
        fetch(`/api/wordpress/categories?projectId=${projectId}`),
        fetch(`/api/wordpress/tags?projectId=${projectId}`),
        fetch(`/api/wordpress/seo-plugin?projectId=${projectId}`),
      ])
      if (catRes.status === 401 || catRes.status === 403 || tagRes.status === 401 || tagRes.status === 403) {
        setError('permission'); return
      }
      if (!catRes.ok || !tagRes.ok) { setError('connection'); return }
      const catData = await catRes.json().catch(() => ({}))
      const tagData = await tagRes.json().catch(() => ({}))
      setCategories(Array.isArray(catData.categories) ? catData.categories.map((c: Term) => ({ id: c.id, name: c.name })) : [])
      setTags(Array.isArray(tagData.tags) ? tagData.tags.map((t: Term) => ({ id: t.id, name: t.name })) : [])
      if (seoRes.ok) { const s = await seoRes.json().catch(() => ({})); if (typeof s.plugin === 'string') setSeoPlugin(s.plugin) }
    } catch {
      setError('connection')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  function toggle(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/content/articles/${articleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        // Additional categories excludes the primary (server unions them anyway).
        body: JSON.stringify({
          wp_primary_category_id: primary,
          wp_category_ids: catIds.filter((id) => id !== primary),
          wp_tag_ids: tagIds,
        }),
      })
      if (!res.ok) { notify(t.saveError, false); return }
      notify(t.saved, true)
    } catch { notify(t.saveError, false) } finally { setSaving(false) }
  }

  function seoPluginLabel(p: string): string {
    if (p === 'yoast') return t.seoYoast
    if (p === 'rankmath') return t.seoRankMath
    if (p === 'permission_error') return t.seoPermissionError
    if (p === 'none') return t.seoNone
    return t.seoUnknown
  }
  function seoStatusLabel(s: string | undefined): string {
    switch (s) {
      case 'verified': return t.statusVerified
      case 'written_not_verifiable': return t.statusWrittenNotVerifiable
      case 'plugin_unavailable': return t.statusPluginUnavailable
      case 'permission_error': return t.statusPermissionError
      case 'exact_failure': return t.statusExactFailure
      default: return ''
    }
  }
  const seoStatusOk = lastExport?.seoStatus === 'verified'
  const seoStatusWarn = lastExport?.seoStatus === 'written_not_verifiable'

  return (
    <Card className="hover:translate-y-0" >
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <Badge variant={seoPlugin === 'yoast' || seoPlugin === 'rankmath' ? 'success' : 'neutral'}>
          {t.seoPluginLabel}: {seoPluginLabel(seoPlugin)}
        </Badge>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t.hint}</p>

      {loading ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">{t.loading}</p>
      ) : error === 'permission' ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.permissionError}</p>
      ) : error === 'connection' ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">{t.connectionError}</p>
      ) : (
        <div className="space-y-3" dir={dir}>
          {/* Primary category */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.primaryCategory}</label>
            <select className={selectCls} value={primary ?? ''} onChange={(e) => setPrimary(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{t.primaryNone}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Additional categories */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.additionalCategories}</label>
            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">{t.empty}</p>
            ) : (
              <div className={listCls}>
                {categories.filter((c) => c.id !== primary).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={catIds.includes(c.id)} onChange={() => setCatIds((p) => toggle(p, c.id))} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.tags}</label>
            {tags.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">{t.empty}</p>
            ) : (
              <div className={listCls}>
                {tags.map((tg) => (
                  <label key={tg.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" checked={tagIds.includes(tg.id)} onChange={() => setTagIds((p) => toggle(p, tg.id))} />
                    <span>{tg.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <Button size="sm" onClick={save} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>

          {/* Last export status (taxonomy + SEO meta) — never a silent success. */}
          {lastExport && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <div className="text-xs text-slate-500 dark:text-slate-400">{t.lastExportLabel}</div>
              {lastExport.seoStatus && (
                <p className={`text-xs ${seoStatusOk ? 'text-green-700 dark:text-green-400' : seoStatusWarn ? 'text-amber-700 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  {seoPluginLabel(lastExport.seoPlugin || seoPlugin)} · {seoStatusLabel(lastExport.seoStatus)}
                </p>
              )}
              {lastExport.taxonomyWarning && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t.taxonomyWarning}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
