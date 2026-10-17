'use client'

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The one checkbox (design contract §5). A real <input type="checkbox"> so the
 * keyboard, the form and the screen reader get the browser's own behaviour, with
 * the native look switched off (`appearance-none`) and drawn on the tokens: a
 * hairline box on the surface, filled with the action colour when checked or
 * indeterminate, and a lucide Check / Minus in action-ink on top.
 *
 *   <Checkbox checked={on} onChange={(next) => setOn(next)} label={t.label} description={t.help} />
 *
 * `indeterminate` is a DOM property, not an attribute, so it is set on the node
 * after render (and mirrored to aria-checked="mixed").
 */
export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked' | 'size'> {
  checked: boolean
  indeterminate?: boolean
  onChange?: (checked: boolean, event: React.ChangeEvent<HTMLInputElement>) => void
  label?: ReactNode
  description?: ReactNode
}

export const CHECKBOX_BOX_CLASSES =
  'peer size-4 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-surface shadow-control ' +
  'transition-[background-color,border-color,box-shadow] duration-150 ease-snappy hover:border-action ' +
  'checked:border-action checked:bg-action indeterminate:border-action indeterminate:bg-action ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line-strong'

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ checked, indeterminate = false, onChange, label, description, disabled, className, id, ...props }, ref) => {
    const inner = useRef<HTMLInputElement>(null)
    useImperativeHandle(ref, () => inner.current as HTMLInputElement)
    const auto = useId()
    const inputId = id ?? `cb-${auto}`
    const descId = description ? `${inputId}-desc` : undefined

    useEffect(() => {
      if (inner.current) inner.current.indeterminate = indeterminate
    }, [indeterminate])

    const box = (
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <input
          ref={inner}
          id={inputId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-checked={indeterminate ? 'mixed' : checked}
          aria-describedby={descId}
          onChange={(e) => onChange?.(e.target.checked, e)}
          className={cn(CHECKBOX_BOX_CLASSES, !label && !description && className)}
          {...props}
        />
        {indeterminate ? (
          <Minus aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-3 text-action-ink" />
        ) : checked ? (
          <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute size-3 text-action-ink" />
        ) : null}
      </span>
    )

    if (!label && !description) return box

    return (
      <div className={cn('flex items-start gap-2.5', className)}>
        <span className="flex h-6 items-center">{box}</span>
        <span className="min-w-0">
          {label && (
            <label htmlFor={inputId} className={cn('block text-copy', disabled ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-ink')}>
              {label}
            </label>
          )}
          {description && <span id={descId} className="block text-caption text-muted">{description}</span>}
        </span>
      </div>
    )
  },
)
Checkbox.displayName = 'Checkbox'

export default Checkbox
