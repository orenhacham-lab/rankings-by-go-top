'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Input, { FIELD_LABEL_CLASSES } from '@/components/ui/Input'

/**
 * A password field with a show / hide switch beside its label: the visitor can
 * check what they typed. Sign-up uses two of them, the password and its
 * confirmation, each with its own inline `error` (w9). The field is ui/Input.
 */
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  showLabel,
  hideLabel,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  error?: string
  showLabel: string
  hideLabel: string
  autoComplete: 'new-password' | 'current-password'
}) {
  const [shown, setShown] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className={FIELD_LABEL_CLASSES}>{label}</label>
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-controls={id}
          aria-pressed={shown}
          data-password-toggle
          className="inline-flex h-7 items-center gap-1 rounded-control px-1.5 text-caption font-medium text-muted transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
        >
          {shown ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
          {shown ? hideLabel : showLabel}
        </button>
      </div>
      <Input
        id={id}
        type={shown ? 'text' : 'password'}
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        hint={hint}
        error={error}
        required
        autoComplete={autoComplete}
        className="h-11 text-left"
      />
    </div>
  )
}
