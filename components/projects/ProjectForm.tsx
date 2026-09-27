'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Project, Client } from '@/lib/supabase/types'
import { saveProjectAction } from '@/app/actions/projects'
import { apiErrorText } from '@/lib/i18n/user-facing-error'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { languageName, regionName, withCurrentOption } from '@/lib/project-settings/view'

/** The business fields the settings screen follows: where each came from, and what was saved. */
type BusinessNoteField = 'business_name' | 'country' | 'language' | 'city'
export type SavedBusinessValues = { business_name: string | null; country: string; language: string; city: string | null }

interface ProjectFormProps {
  project?: Project
  clients: Client[]
  defaultClientId?: string
  /** On a create, receives the new project's id so the caller can open it. */
  onSuccess: (createdId?: string) => void
  onCancel: () => void
  /** Start from these instead of the project's own values: suggestions the owner put into the form. */
  initialValues?: Partial<{ business_name: string; country: string; language: string }>
  /** A note under a field, such as where its value came from. */
  fieldNotes?: Partial<Record<BusinessNoteField, React.ReactNode>>
  /** After an update is saved, with the business values it saved. Never blocks the save. */
  onUpdated?: (saved: SavedBusinessValues) => void | Promise<void>
}

export default function ProjectForm({
  project,
  clients,
  defaultClientId,
  onSuccess,
  onCancel,
  initialValues,
  fieldNotes,
  onUpdated,
}: ProjectFormProps) {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const f = dict.projects.form

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoScan, setAutoScan] = useState(project?.auto_scan_enabled ?? false)
  // Phase 3 — weekly and monthly_first_day removed; only manual/monthly remain.
  const [scanFreq, setScanFreq] = useState<'manual' | 'monthly'>(
    project?.scan_frequency || 'manual'
  )
  // The values the form opened with stay selectable even when they are not in
  // the short lists below (a scan can store any country and language).
  const startCountry = initialValues?.country || project?.country || 'IL'
  const startLanguage = initialValues?.language || project?.language || 'he'
  const [country, setCountry] = useState(startCountry)
  const [city, setCity] = useState(project?.city || '')

  const validateUSCityFormat = (cityStr: string): boolean => {
    if (!cityStr.trim()) return false
    // Format: "City, ST" where ST is 2-letter state code
    const pattern = /^[A-Za-z\s]+,\s?[A-Z]{2}$/
    return pattern.test(cityStr.trim())
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    // Validate US city format
    if (country === 'US') {
      if (!city.trim()) {
        setError(f.errorUsCity)
        return
      }
      if (!validateUSCityFormat(city)) {
        setError(f.errorUsCityFormat)
        return
      }
    }

    setLoading(true)

    const formData = new FormData(e.currentTarget)
    formData.set('auto_scan_enabled', autoScan ? 'true' : 'false')

    try {
      let createdId: string | undefined
      if (project) {
        // Update existing project - use server action
        // The save returns its refusal in this screen's language.
        const saved = await saveProjectAction(project.id, formData)
        if (!saved.ok) {
          setError(saved.error || dict.common.saveError)
          return
        }
        // The values as updateProjectAction stored them, for a caller that
        // records what the owner changed. The save itself already happened.
        try {
          await onUpdated?.({
            business_name: (formData.get('business_name') as string) || null,
            country: (formData.get('country') as string) || 'IL',
            language: (formData.get('language') as string) || 'he',
            city: (formData.get('city') as string) || null,
          })
        } catch {
          /* the project is saved either way */
        }
      } else {
        // Create new project - use API route
        const response = await fetch('/api/projects/create', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => null)
          setError(apiErrorText(errorData, language, f.errorCreate))
          return
        }

        const created = await response.json()
        createdId = typeof created?.data?.id === 'string' ? created.data.id : undefined
      }
      onSuccess(createdId)
    } catch {
      setError(dict.common.saveError)
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
          label={f.clientLabel}
          name="client_id"
          defaultValue={defaultClientId || ''}
          required
          options={[
            { value: '', label: f.clientPlaceholder },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      )}

      <Input
        label={f.nameLabel}
        name="name"
        defaultValue={project?.name}
        required
        placeholder={f.namePlaceholder}
      />

      <Input
        label={f.domainLabel}
        name="target_domain"
        defaultValue={project?.target_domain}
        required
        placeholder={f.domainPlaceholder}
        hint={f.domainHint}
      />

      <div>
        <Input
          label={f.businessNameLabel}
          name="business_name"
          defaultValue={initialValues?.business_name ?? (project?.business_name || '')}
          placeholder={f.businessNamePlaceholder}
        />
        {fieldNotes?.business_name}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Select
            label={f.countryLabel}
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={withCurrentOption([
              { value: 'IL', label: f.countryIL },
              { value: 'US', label: f.countryUS },
              { value: 'GB', label: f.countryGB },
            ], startCountry, (code) => regionName(code, language))}
          />
          {fieldNotes?.country}
        </div>
        <div>
          <Select
            label={f.languageLabel}
            name="language"
            defaultValue={startLanguage}
            options={withCurrentOption([
              { value: 'he', label: f.languageHe },
              { value: 'en', label: f.languageEn },
              { value: 'ar', label: f.languageAr },
            ], startLanguage, (code) => languageName(code, language))}
          />
          {fieldNotes?.language}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Input
            label={country === 'US' ? f.cityLabelUS : f.cityLabel}
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={country === 'US' ? f.cityPlaceholderUS : f.cityPlaceholder}
            hint={country === 'US' ? f.cityHintUS : ''}
            required={country === 'US'}
          />
          {fieldNotes?.city}
        </div>
        <Select
          label={f.deviceLabel}
          name="device_type"
          defaultValue={project?.device_type || ''}
          options={[
            { value: '', label: f.deviceDefault },
            { value: 'desktop', label: f.deviceDesktop },
            { value: 'mobile', label: f.deviceMobile },
          ]}
        />
      </div>

      {/* Scheduling */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">{f.schedulingTitle}</h4>

        <Select
          label={f.scanFrequencyLabel}
          name="scan_frequency"
          value={scanFreq}
          onChange={(e) => {
            setScanFreq(e.target.value as 'manual' | 'monthly')
            if (e.target.value === 'manual') setAutoScan(false)
          }}
          options={[
            { value: 'manual', label: f.scanFreqManual },
            { value: 'monthly', label: f.scanFreqMonthly },
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
            <span className="text-sm text-slate-700 dark:text-slate-200">{f.autoScanLabel}</span>
          </label>
        )}
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {project ? f.submitUpdate : f.submitCreate}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {f.cancel}
        </Button>
      </div>
    </form>
  )
}
