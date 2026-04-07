'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Project, Client } from '@/lib/supabase/types'
import { createProjectAction, updateProjectAction } from '@/app/actions/projects'

interface ProjectFormProps {
  project?: Project
  clients: Client[]
  defaultClientId?: string
  onSuccess: () => void
  onCancel: () => void
}

export default function ProjectForm({
  project,
  clients,
  defaultClientId,
  onSuccess,
  onCancel,
}: ProjectFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoScan, setAutoScan] = useState(project?.auto_scan_enabled ?? false)
  const [scanFreq, setScanFreq] = useState<'manual' | 'weekly' | 'monthly' | 'monthly_first_day'>(
    project?.scan_frequency || 'manual'
  )

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.set('auto_scan_enabled', autoScan ? 'true' : 'false')

    try {
      if (project) {
        await updateProjectAction(project.id, formData)
      } else {
        await createProjectAction(formData)
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

      {!project && (
        <Select
          label="לקוח *"
          name="client_id"
          defaultValue={defaultClientId || ''}
          required
          options={[
            { value: '', label: 'בחר לקוח...' },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      )}

      <Input
        label="שם הפרויקט *"
        name="name"
        defaultValue={project?.name}
        required
        placeholder="פרויקט SEO ראשי"
      />

      <Input
        label="דומיין יעד *"
        name="target_domain"
        defaultValue={project?.target_domain}
        required
        placeholder="example.co.il"
        hint="הכנס דומיין בלבד, ללא https://"
      />

      <Input
        label="שם עסק (לגוגל מפות)"
        name="business_name"
        defaultValue={project?.business_name || ''}
        placeholder="שם העסק כפי שמופיע בגוגל מפות"
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label="מדינה"
          name="country"
          defaultValue={project?.country || 'IL'}
          options={[
            { value: 'IL', label: 'ישראל' },
            { value: 'US', label: 'ארצות הברית' },
            { value: 'GB', label: 'בריטניה' },
          ]}
        />
        <Select
          label="שפה"
          name="language"
          defaultValue={project?.language || 'he'}
          options={[
            { value: 'he', label: 'עברית' },
            { value: 'en', label: 'אנגלית' },
            { value: 'ar', label: 'ערבית' },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="עיר / מיקום"
          name="city"
          defaultValue={project?.city || ''}
          placeholder="תל אביב"
        />
        <Select
          label="מכשיר"
          name="device_type"
          defaultValue={project?.device_type || ''}
          options={[
            { value: '', label: 'ברירת מחדל' },
            { value: 'desktop', label: 'מחשב' },
            { value: 'mobile', label: 'נייד' },
          ]}
        />
      </div>

      {/* Scheduling */}
      <div className="border-t border-slate-200 pt-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3">הגדרות סריקה אוטומטית</h4>

        <Select
          label="תדירות סריקה"
          name="scan_frequency"
          value={scanFreq}
          onChange={(e) => {
            setScanFreq(e.target.value as 'manual' | 'weekly' | 'monthly' | 'monthly_first_day')
            if (e.target.value === 'manual') setAutoScan(false)
          }}
          options={[
            { value: 'manual', label: 'ידני בלבד' },
            { value: 'weekly', label: 'פעם בשבוע' },
            { value: 'monthly', label: 'פעם בחודש' },
            { value: 'monthly_first_day', label: 'כל חודש ב-1 לחודש' },
          ]}
        />

        {scanFreq !== 'manual' && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScan}
              onChange={(e) => setAutoScan(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">הפעל סריקה אוטומטית</span>
          </label>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {project ? 'שמור שינויים' : 'צור פרויקט'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
