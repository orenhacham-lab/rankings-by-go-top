import { Fragment, type CSSProperties, type ReactNode } from 'react'

/**
 * A copy string with its `{name}` tokens replaced by elements, for copy that
 * carries a domain or a name. A token with no value stays as written.
 */
export function fillRich(template: string, vars: Record<string, ReactNode>): ReactNode {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    return <Fragment key={i}>{key !== undefined && key in vars ? vars[key] : part}</Fragment>
  })
}

/**
 * A domain, a URL or a brand inside a sentence of either direction. Without
 * the isolate, "example.com." inside a Hebrew sentence renders as ".example.com".
 */
export function Ltr({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  )
}

/**
 * A field that may hold either language (a Hebrew screen, an English store)
 * takes the direction of what was typed, from its first letter. The app's
 * global CSS sets every input to the page's direction, which outranks the
 * `dir` attribute, so the direction is set inline as well: an English
 * description on the Hebrew screen then reads from its start instead of being
 * cut off at it. Nothing is set until a letter is typed.
 */
export function bidiField(value: string): { dir?: 'ltr' | 'rtl'; style?: CSSProperties } {
  const first = /\p{L}/u.exec(value)?.[0]
  if (!first) return {}
  const dir = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(first) ? 'rtl' : 'ltr'
  return { dir, style: { direction: dir, textAlign: 'start' } }
}
