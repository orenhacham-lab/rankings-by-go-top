'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { TrackingTarget } from '@/lib/supabase/types'
import { createTrackingTargetAction, updateTrackingTargetAction } from '@/app/actions/tracking-targets'

interface TrackingTargetFormProps {
  target?: TrackingTarget
  projectId: string
  defaultDomain?: string
  defaultBusinessName?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function TrackingTargetForm({
  target,
  projectId,
  defaultDomain,
  defaultBusinessName,
  onSuccess,
  onCancel,
}: TrackingTargetFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<'google_search' | 'google_maps'>(target?.engine_type || 'google_search')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (target) {
        await updateTrackingTargetAction(target.id, formData)
      } else {
        await createTrackingTargetAction(formData)
      }
      onSuccess()
    } catch (err) {
      setError((err as Error).message || 'שגיאה בשמירה')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <input type="hidden" name="project_id" value={projectId} />

      <Input
        label="מילת מפתח *"
        name="keyword"
        defaultValue={target?.keyword}
        required
        placeholder="קידום אתרים תל אביב"
      />

      <Select
        label="מנוע חיפוש *"
        name="engine_type"
        value={engine}
        onChange={(e) => setEngine(e.target.value as 'google_search' | 'google_maps')}
        options={[
          { value: 'google_search', label: 'גוגל חיפוש אורגני' },
          { value: 'google_maps', label: 'גוגל מפות' },
        ]}
      />

      {engine === 'google_search' && (
        <Input
          label="דומיין יעד"
          name="target_domain"
          defaultValue={target?.target_domain || defaultDomain || ''}
          placeholder="example.co.il"
          hint="הדומיין שמחפשים בתוצאות החיפוש"
        />
      )}

      {engine === 'google_maps' && (
        <Input
          label="שם עסק ביעד"
          name="target_business_name"
          defaultValue={target?.target_business_name || defaultBusinessName || ''}
          placeholder="שם העסק כפי שמופיע בגוגל מפות"
        />
      )}

      <Input
        label="דף נחיתה מועדף (אופציונלי)"
        name="preferred_landing_page"
        defaultValue={target?.preferred_landing_page || ''}
        placeholder="/שירותים/קידום-אתרים"
      />

      <Textarea
        label="הערות"
        name="notes"
        defaultValue={target?.notes || ''}
        placeholder="הערות נוספות..."
        rows={2}
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {target ? 'שמור שינויים' : 'הוסף מילת מפתח'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
