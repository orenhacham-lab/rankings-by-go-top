'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { Client } from '@/lib/supabase/types'
import { updateClientAction } from '@/app/actions/clients'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

interface ClientFormProps {
  client?: Client
  onSuccess: () => void
  onCancel: () => void
}

export default function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')
  const f = dict.clients.form

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const formData = new FormData(e.currentTarget)

    try {
      if (client) {
        // Update existing client - use server action
        await updateClientAction(client.id, formData)
      } else {
        // Create new client - use API route
        const response = await fetch('/api/clients/create', {
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
      const errorMessage = (err as Error).message || dict.common.saveError
      setError(errorMessage)
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

      <Input
        label={f.nameLabel}
        name="name"
        defaultValue={client?.name}
        required
        placeholder={f.namePlaceholder}
      />

      <Input
        label={f.contactNameLabel}
        name="contact_name"
        defaultValue={client?.contact_name || ''}
        placeholder={f.contactNamePlaceholder}
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label={f.emailLabel}
          name="email"
          type="email"
          defaultValue={client?.email || ''}
          placeholder={f.emailPlaceholder}
        />
        <Input
          label={f.phoneLabel}
          name="phone"
          defaultValue={client?.phone || ''}
          placeholder={f.phonePlaceholder}
        />
      </div>

      <Textarea
        label={f.notesLabel}
        name="notes"
        defaultValue={client?.notes || ''}
        placeholder={f.notesPlaceholder}
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {client ? f.submitUpdate : f.submitCreate}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {f.cancel}
        </Button>
      </div>
    </form>
  )
}
