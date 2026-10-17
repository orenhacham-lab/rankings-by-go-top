'use client'

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * The one on/off switch (design contract §5), lifted from the weekly-email card.
 * A <button role="switch" aria-checked>, so Space/Enter toggle it and a screen
 * reader says "on"/"off". The track is a pill (line-strong off, action on); the
 * thumb is a white dot that slides to the logical END when on: to the right in
 * English, to the left in Hebrew (mirrored with rtl:).
 *
 *   <Switch checked={on} onChange={setOn} label={t.label} description={t.help} />
 *
 * Without `label`, pass `aria-label` (or aria-labelledby) so it still has a name.
 */
export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'type' | 'role'> {
  checked: boolean
  onChange?: (next: boolean) => void
  label?: ReactNode
  description?: ReactNode
}

export const SWITCH_TRACK_CLASSES =
  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill bg-line-strong aria-checked:bg-action ' +
  'transition-colors duration-150 ease-snappy ' +
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

export const SWITCH_THUMB_CLASSES =
  'pointer-events-none inline-block size-4 rounded-pill bg-surface shadow-control transition-transform duration-150 ease-snappy'

const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onChange, label, description, disabled, className, id, onClick, ...props }, ref) => {
    const auto = useId()
    const switchId = id ?? `sw-${auto}`
    const labelId = label ? `${switchId}-label` : undefined
    const descId = description ? `${switchId}-desc` : undefined

    const control = (
      <button
        ref={ref}
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={descId}
        disabled={disabled}
        onClick={(e) => {
          onClick?.(e)
          if (!e.defaultPrevented) onChange?.(!checked)
        }}
        className={cn(SWITCH_TRACK_CLASSES, !label && !description && className)}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            SWITCH_THUMB_CLASSES,
            checked ? 'translate-x-[1.125rem] rtl:-translate-x-[1.125rem]' : 'translate-x-0.5 rtl:-translate-x-0.5',
          )}
        />
      </button>
    )

    if (!label && !description) return control

    return (
      <div className={cn('flex items-start justify-between gap-4', className)}>
        <span className="min-w-0">
          {label && (
            <label
              id={labelId}
              htmlFor={switchId}
              className={cn('block text-copy font-semibold', disabled ? 'cursor-not-allowed text-muted' : 'cursor-pointer text-ink')}
            >
              {label}
            </label>
          )}
          {description && <span id={descId} className="block text-caption text-muted">{description}</span>}
        </span>
        <span className="flex h-6 items-center">{control}</span>
      </div>
    )
  },
)
Switch.displayName = 'Switch'

export default Switch
