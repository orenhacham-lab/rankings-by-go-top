'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Project, Client } from '@/lib/supabase/types'
import { createProjectAction, updateProjectAction } from '@/app/actions/projects'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

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
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const f = dict.projects.form

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [autoScan, setAutoScan] = useState(project?.auto_scan_enabled ?? false)
  // Phase 3 — weekly and monthly_first_day removed; only manual/monthly remain.
  const [scanFreq, setScanFreq] = useState<'manual' | 'monthly'>(
    project?.scan_frequency || 'manual'
  )
  const [country, setCountry] = useState(project?.country || 'IL')
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
      if (project) {
        // Update existing project - use server action
        await updateProjectAction(project.id, formData)
      } else {
        // Create new project - use API route
        const response = await fetch('/api/projects/create', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || f.errorCreate)
        }

        await response.json()
      }
      onSuccess()
    } catch (err) {
      setError((err as Error).message || dict.common.saveError)
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

      <Input
        label={f.businessNameLabel}
        name="business_name"
        defaultValue={project?.business_name || ''}
        placeholder={f.businessNamePlaceholder}
      />

      <div className="grid grid-cols-2 gap-4">
        <Select
          label={f.countryLabel}
          name="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          options={[
            { value: 'IL', label: f.countryIL },
            { value: 'US', label: f.countryUS },
            { value: 'GB', label: f.countryGB },
          ]}
        />
        <Select
          label={f.languageLabel}
          name="language"
          defaultValue={project?.language || 'he'}
          options={[
            { value: 'he', label: f.languageHe },
            { value: 'en', label: f.languageEn },
            { value: 'ar', label: f.languageAr },
          ]}
        />
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
