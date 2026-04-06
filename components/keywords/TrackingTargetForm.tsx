'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { TrackingTarget } from '@/lib/supabase/types'
import {
  createTrackingTargetAction,
  updateTrackingTargetAction,
  createBulkTrackingTargetsAction,
} from '@/app/actions/tracking-targets'

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
  const [successMsg, setSuccessMsg] = useState('')
  const [engine, setEngine] = useState<'google_search' | 'google_maps'>(target?.engine_type || 'google_search')
  // Bulk mode only available when creating (not editing)
  const [bulkMode, setBulkMode] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (target) {
        await updateTrackingTargetAction(target.id, formData)
        onSuccess()
      } else if (bulkMode) {
        const result = await createBulkTrackingTargetsAction(formData)
        const msg = `נוספו ${result.created} מילות מפתח${result.skipped > 0 ? ` (${result.skipped} כבר קיימות)` : ''}`
        setSuccessMsg(msg)
        setTimeout(() => onSuccess(), 1200)
      } else {
        await createTrackingTargetAction(formData)
        onSuccess()
      }
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
      {successMsg && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {successMsg}
        </div>
      )}

      <input type="hidden" name="project_id" value={projectId} />

      {/* Bulk mode toggle — only when creating */}
      {!target && (
        <div className="flex gap-2 border-b border-slate-100 pb-3">
          <button
            type="button"
            onClick={() => setBulkMode(false)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              !bulkMode
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            מילה בודדת
          </button>
          <button
            type="button"
            onClick={() => setBulkMode(true)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              bulkMode
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            הוספה מרובה
          </button>
        </div>
      )}

      {/* Keyword input — single or bulk */}
      {bulkMode ? (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            מילות מפתח (שורה אחת לכל מילה) *
          </label>
          <textarea
            name="keywords"
            required
            rows={6}
            dir="rtl"
            placeholder={'קידום אתרים בפתח תקווה\nקידום אתרים בתל אביב\nקידום אתרים לעסקים קטנים'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-['Rubik']"
          />
          <p className="text-xs text-slate-400 mt-1">
            הדבק מילות מפתח — שורה אחת לכל מילה. שורות ריקות ישוחו. כפולות תידלגנה.
          </p>
        </div>
      ) : (
        <Input
          label="מילת מפתח *"
          name="keyword"
          defaultValue={target?.keyword}
          required
          placeholder="קידום אתרים תל אביב"
        />
      )}

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
          {target ? 'שמור שינויים' : bulkMode ? 'הוסף מילות מפתח' : 'הוסף מילת מפתח'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
