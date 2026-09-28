'use client'

import { useCallback, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

/**
 * The in-app replacement for window.confirm: a small modal on the design
 * primitives, so a question never drops into the browser's grey system box.
 *
 *   const { confirm, dialog } = useConfirm()
 *   if (!(await confirm({ title, body, confirmLabel, tone: 'danger' }))) return
 *   …
 *   return <>{…}{dialog}</>
 */
export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  /** danger for deletes and other destructive acts; default otherwise. */
  tone?: 'danger' | 'default'
}

export function useConfirm() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setOptions(null)
  }, [])

  const confirm = useCallback((next: ConfirmOptions) => {
    // A second question while one is open answers the first with "no".
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const dialog = (
    <Modal open={options !== null} onClose={() => settle(false)} title={options?.title ?? ''} size="sm">
      {options?.body && <p className="whitespace-pre-line text-copy text-body">{options.body}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={() => settle(false)}>
          {options?.cancelLabel ?? dict.common.cancel}
        </Button>
        <Button variant={options?.tone === 'danger' ? 'danger' : 'primary'} onClick={() => settle(true)} data-confirm-accept>
          {options?.confirmLabel}
        </Button>
      </div>
    </Modal>
  )

  return { confirm, dialog }
}
