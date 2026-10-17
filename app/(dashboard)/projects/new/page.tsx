'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import ProjectForm from '@/components/projects/ProjectForm'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function NewProjectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const defaultClientId = searchParams.get('client_id') || ''
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const t = dict.projects
  const common = dict.common

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadClients() {
      const supabase = createClient()
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .order('name')

      setClients(data || [])
      setLoading(false)
    }

    loadClients()
  }, [])

  function handleSuccess(createdId?: string) {
    if (defaultClientId) {
      router.push(`/clients/${defaultClientId}`)
      router.refresh()
      return
    }

    // A new project opens as the CURRENT project, on its settings, where it gets
    // connected. The provider adopts the id only after validating it against the
    // user's own projects.
    router.push(createdId ? `/settings?projectId=${encodeURIComponent(createdId)}` : '/dashboard')
  }

  return (
    <div>
      <Header
        title={t.newProjectTitle}
        subtitle={t.newProjectSubtitle}
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            {common.back}
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          {common.loading}
        </div>
      ) : (
        <Card>
          <ProjectForm
            clients={clients}
            defaultClientId={defaultClientId}
            onSuccess={handleSuccess}
            onCancel={() => router.back()}
          />
        </Card>
      )}
    </div>
  )
}
