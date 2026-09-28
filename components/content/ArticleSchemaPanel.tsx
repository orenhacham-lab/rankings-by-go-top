'use client'

/**
 * The article viewer's Schema tab (content review C3, part 1): the JSON-LD the
 * pure builder (lib/content/structured-data.ts) makes from the article's fields,
 * shown per block, with one "copy code" for all of it as script elements.
 *
 * Built live from the editor's current fields, so it matches what the owner
 * sees. The copy is honest about what the markup does: it helps engines read
 * the page; it promises no special display in Google (FAQ rich results are
 * limited to a few government and health sites since 2023).
 */
import { useMemo, useState } from 'react'
import { Copy, Info } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { buildArticleJsonLd, buildFaqJsonLd, serializeJsonLd, toScriptTags, type StructuredDataInput, type JsonLd } from '@/lib/content/structured-data'
import { browserClipboardEnv, copyPlainText } from '@/lib/content/article-export'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

type SchemaDict = DashboardDictionary['contentHub']['editor']['schema']

export default function ArticleSchemaPanel({ t, failText, input, isWebhook, onNotify }: {
  t: SchemaDict
  /** The shared "the browser blocked the copy" sentence. */
  failText: string
  input: StructuredDataInput
  isWebhook: boolean
  onNotify: (text: string, ok: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const article = useMemo(() => buildArticleJsonLd(input), [input])
  const faq = useMemo(() => buildFaqJsonLd(input.faq, input.language), [input])
  const blocks = useMemo(() => [article, faq].filter((b): b is JsonLd => !!b), [article, faq])

  async function copy() {
    setBusy(true)
    try {
      const how = await copyPlainText(toScriptTags(blocks), browserClipboardEnv())
      onNotify(how === 'none' ? failText : t.copied, how !== 'none')
    } finally {
      setBusy(false)
    }
  }

  const block = (label: string, value: JsonLd | null, empty: string) => (
    <section className="space-y-2" aria-label={label}>
      <h4 className="text-copy font-semibold text-ink">{label}</h4>
      {value ? (
        <pre dir="ltr" data-testid="schema-json" className="max-h-96 overflow-auto rounded-control bg-contrast p-3 text-left font-mono text-caption leading-relaxed text-contrast-ink">
          {serializeJsonLd(value, true)}
        </pre>
      ) : (
        <p className="rounded-control border border-dashed border-line bg-sunk/50 px-3 py-2 text-caption text-muted">{empty}</p>
      )}
    </section>
  )

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-3xl">
          <h3 className="text-section font-semibold text-ink">{t.title}</h3>
          <p className="mt-1 text-copy text-body">{t.intro}</p>
        </div>
        <Button size="sm" onClick={() => void copy()} loading={busy} disabled={busy || blocks.length === 0}>
          {!busy && <Copy size={14} aria-hidden />} {t.copy}
        </Button>
      </div>

      <ul className="mb-4 space-y-1.5 text-caption text-muted">
        <li className="flex gap-2"><Info size={14} aria-hidden className="mt-0.5 shrink-0 text-info" /><span>{t.faqNote}</span></li>
        <li className="flex gap-2"><Info size={14} aria-hidden className="mt-0.5 shrink-0 text-info" /><span>{isWebhook ? t.webhookNote : t.duplicateNote}</span></li>
        <li className="flex gap-2"><Info size={14} aria-hidden className="mt-0.5 shrink-0 text-info" /><span>{t.liveNote}</span></li>
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        {block(t.blockArticle, article, t.empty)}
        {block(t.blockFaq, faq, t.noFaq)}
      </div>
    </Card>
  )
}
