'use client'

/**
 * Optional "article author on your site" choice for the WordPress publish card.
 * Renders nothing until the project's author list loads, and nothing at all when it is unavailable
 * (lib/content/wordpress-author-choice.ts decides): publishing never waits on it or depends on it.
 */

import { useEffect, useState } from 'react'
import Select from '@/components/ui/Select'
import { loadAuthorOptions, type WordPressAuthorOption } from '@/lib/content/wordpress-author-choice'

export default function WordPressAuthorPicker({
  projectId,
  value,
  onChange,
  onOptions,
  disabled,
  dict,
}: {
  projectId: string
  value: number | null
  onChange: (id: number | null) => void
  onOptions: (options: WordPressAuthorOption[] | null) => void
  disabled?: boolean
  dict: { label: string; hint: string; defaultOption: string }
}) {
  const [options, setOptions] = useState<WordPressAuthorOption[] | null>(null)

  useEffect(() => {
    let live = true
    void loadAuthorOptions(projectId).then((list) => {
      if (!live) return
      setOptions(list)
      onOptions(list)
    })
    return () => { live = false }
  }, [projectId, onOptions])

  if (!options) return null
  return (
    <div className="mb-3 max-w-sm" data-wp-author-picker="">
      <Select
        id="wp-author"
        label={dict.label}
        value={value == null ? '' : String(value)}
        disabled={disabled}
        onChange={(ev) => onChange(ev.target.value ? Number(ev.target.value) : null)}
        options={[{ value: '', label: dict.defaultOption }, ...options.map((o) => ({ value: String(o.id), label: o.name }))]}
      />
      <p className="mt-1 text-caption text-muted">{dict.hint}</p>
    </div>
  )
}
