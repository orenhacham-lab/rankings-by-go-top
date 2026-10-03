'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ClientForm from '@/components/clients/ClientForm'
import ClientsTable from '@/components/clients/ClientsTable'
import { createClient } from '@/lib/supabase/client'
import { Client } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ClientsPage() {
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)

  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  // ✅ פונקציה שמביאה נתונים בלבד
  async function fetchClients() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    return data || []
  }

  // ✅ פונקציה לרענון רגיל
  async function loadClients() {
    setLoading(true)
    const data = await fetchClients()
    setClients(data)
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    async function initializeClients() {
      const data = await fetchClients()
      if (!isMounted) return
      setClients(data)
      setLoading(false)
    }

    void initializeClients()

    return () => {
      isMounted = false
    }
  }, [])

  function handleSuccess() {
    setShowCreate(false)
    loadClients()
  }

  return (
    <div>
      <Header
        title={dict.clients.title}
        subtitle={`${dict.clients.countPrefix} ${clients.length} ${dict.clients.countSuffix}`}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus aria-hidden="true" className="size-4" />
            {dict.clients.newClient}
          </Button>
        }
      />

      {loading ? (
        <TableSkeleton label={dict.common.loading} rows={4} />
      ) : (
        <ClientsTable clients={clients} onClientsChange={loadClients} />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={dict.clients.modal.newTitle}
        size="md"
      >
        <ClientForm
          onSuccess={handleSuccess}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </div>
  )
}