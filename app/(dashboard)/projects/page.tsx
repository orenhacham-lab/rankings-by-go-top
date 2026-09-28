'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from '@/components/projects/ProjectForm'
import ProjectsTable from '@/components/projects/ProjectsTable'
import { TableSkeleton } from '@/components/ui/Skeleton'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ProjectsPage() {
  const searchParams = useSearchParams()
  const defaultClientId = searchParams.get('client_id') || ''
  const shouldOpenCreate = searchParams.get('create') === '1'

  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)

  const [projects, setProjects] = useState<(Project & { clients?: Client })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(shouldOpenCreate)

  async function fetchProjectsAndClients() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return {
        projects: [],
        clients: [],
      }
    }

    const [{ data: projectsData }, { data: clientsData }] = await Promise.all([
      supabase
        .from('projects')
        .select('*, clients(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('user_id', user.id).eq('is_active', true).order('name'),
    ])

    return {
      projects: projectsData || [],
      clients: clientsData || [],
    }
  }

  async function loadData() {
    setLoading(true)
    const { projects: loadedProjects, clients: loadedClients } = await fetchProjectsAndClients()
    setProjects(loadedProjects)
    setClients(loadedClients)
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    async function initializeData() {
      const { projects: loadedProjects, clients: loadedClients } = await fetchProjectsAndClients()
      if (!isMounted) return
      setProjects(loadedProjects)
      setClients(loadedClients)
      setLoading(false)
    }

    void initializeData()

    return () => {
      isMounted = false
    }
  }, [])

  function handleSuccess() {
    setShowCreate(false)
    loadData()
  }

  return (
    <div>
      <Header
        title={dict.projects.title}
        subtitle={dict.projects.subtitle}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            {dict.projects.newProject}
          </Button>
        }
      >
        {!loading && (
          <p className="text-caption text-muted">{`${dict.projects.countPrefix} ${projects.length} ${dict.projects.countSuffix}`}</p>
        )}
      </Header>

      {loading ? (
        <TableSkeleton label={dict.common.loading} rows={4} />
      ) : (
        <ProjectsTable projects={projects} clients={clients} onProjectsChange={loadData} />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title={dict.projects.modal.newTitle}
        size="lg"
      >
        <ProjectForm
          clients={clients}
          defaultClientId={defaultClientId}
          onSuccess={handleSuccess}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </div>
  )
}