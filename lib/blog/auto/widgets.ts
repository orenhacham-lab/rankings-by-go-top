/**
 * THE TWO REAL COMPONENTS EVERY AUTO-WRITTEN ARTICLE ENDS WITH.
 *
 * `lib/articles/widgets.ts` lets an article mark a place for the plan cards and
 * the trial call to action, and the page puts the real component there. The
 * model is told NOT to write either of them, so they are appended here instead
 * of hoped for: deterministic, and idempotent if a body somehow already carries
 * one.
 *
 * Pure: a string in, a string out.
 */

export const PLANS_WIDGET = '<div class="gt-plans"></div>'
export const CTA_WIDGET = '<div class="gt-cta"></div>'

const hasWidget = (html: string, widget: 'plans' | 'cta'): boolean =>
  new RegExp(`<div\\b[^>]*\\bclass\\s*=\\s*"[^"]*\\bgt-${widget}\\b`, 'i').test(html)

export function withArticleWidgets(html: string): string {
  const parts = [html.trimEnd()]
  if (!hasWidget(html, 'plans')) parts.push(PLANS_WIDGET)
  if (!hasWidget(html, 'cta')) parts.push(CTA_WIDGET)
  return parts.join('\n')
}
