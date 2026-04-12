'use client'

import { useState } from 'react'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import Button from '@/components/ui/Button'
import { Client } from '@/lib/supabase/types'
import { updateClientAction } from '@/app/actions/clients'

interface ClientFormProps {
  client?: Client
  onSuccess: () => void
  onCancel: () => void
}

export default function ClientForm({ client, onSuccess, onCancel }: ClientFormProps) {
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
          throw new Error(errorData.error || 'שגיאה בהוספת לקוח')
        }

        await response.json()
      }
      onSuccess()
    } catch (err) {
      const errorMessage = (err as Error).message || 'שגיאה בשמירה'
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
        label="שם הלקוח *"
        name="name"
        defaultValue={client?.name}
        required
        placeholder="שם החברה / העסק"
      />

      <Input
        label="איש קשר"
        name="contact_name"
        defaultValue={client?.contact_name || ''}
        placeholder="שם מלא"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="אימייל"
          name="email"
          type="email"
          defaultValue={client?.email || ''}
          placeholder="email@example.com"
        />
        <Input
          label="טלפון"
          name="phone"
          defaultValue={client?.phone || ''}
          placeholder="050-0000000"
        />
      </div>

      <Textarea
        label="הערות"
        name="notes"
        defaultValue={client?.notes || ''}
        placeholder="הערות נוספות על הלקוח..."
      />

      <div className="flex gap-3 pt-2">
        <Button type="submit" loading={loading}>
          {client ? 'שמור שינויים' : 'הוסף לקוח'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
