'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/layout/Header'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from '@/components/projects/ProjectForm'
import ProjectsTable from '@/components/projects/ProjectsTable'
import { createClient } from '@/lib/supabase/client'
import { Project, Client } from '@/lib/supabase/types'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<(Project & { clients?: Client })[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  async function loadData() {
    const supabase = createClient()
    const [{ data: projectsData }, { data: clientsData }] = await Promise.all([
      supabase
        .from('projects')
        .select('*, clients(*)')
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('is_active', true).order('name'),
    ])
    setProjects(projectsData || [])
    setClients(clientsData || [])
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  function handleSuccess() {
    setShowCreate(false)
    loadData()
  }

  return (
    <div>
      <Header
        title="פרויקטים"
        subtitle={`סה"כ ${projects.length} פרויקטים`}
        actions={
          <Button onClick={() => setShowCreate(true)}>
            + פרויקט חדש
          </Button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
          טוען...
        </div>
      ) : (
        <ProjectsTable projects={projects} clients={clients} />
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="פרויקט חדש"
        size="lg"
      >
        <ProjectForm
          clients={clients}
          onSuccess={handleSuccess}
          onCancel={() => setShowCreate(false)}
        />
      </Modal>
    </div>
  )
}
