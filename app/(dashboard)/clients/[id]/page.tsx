'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, Project } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from '@/components/projects/ProjectForm'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.clientDetail
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateProject, setShowCreateProject] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: clientData }, { data: projectsData }] = await Promise.all([
        supabase.from('clients').select('*').eq('id', id).single(),
        supabase.from('projects').select('*').eq('client_id', id).order('created_at', { ascending: false }),
      ])
      setClient(clientData)
      setProjects(projectsData || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        {k.loading}
      </div>
    )
  }

  if (!client) {
    return <div className="text-center py-20 text-slate-400">{k.clientNotFound}</div>
  }

  return (
    <div>
      <Header
        title={client.name}
        subtitle={k.details}
        actions={
          <Link href="/clients">
            <Button variant="outline">{k.backToClients}</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-4">{k.details}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.clientName}</dt>
              <dd className="font-medium dark:text-slate-100">{client.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.contactName}</dt>
              <dd className="font-medium dark:text-slate-100">{client.contact_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.email}</dt>
              <dd className="font-medium dark:text-slate-100">{client.email || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.phone}</dt>
              <dd className="font-medium dark:text-slate-100">{client.phone || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.status}</dt>
              <dd><ActiveBadge active={client.is_active} /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500 dark:text-slate-400">{k.createdAt}</dt>
              <dd className="dark:text-slate-200">{formatDate(client.created_at)}</dd>
            </div>
          </dl>
          {client.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.notes}</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{client.notes}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{k.projects} ({projects.length})</h3>
            <Button size="sm" onClick={() => setShowCreateProject(true)}>{k.newProject}</Button>
          </div>

          {projects.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-slate-400 dark:text-slate-500 mb-4">{k.noProjectsYet}</p>
              <Button onClick={() => setShowCreateProject(true)}>{k.addFirstProject}</Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {projects.map((project) => (
                <Card key={project.id} className="flex items-center justify-between">
                  <div>
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-semibold text-blue-600 hover:underline"
                    >
                      {project.name}
                    </Link>
                    <p className="text-sm text-slate-500 mt-0.5">{project.target_domain}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {project.city && `${project.city} · `}
                      {k.updated} {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <ActiveBadge active={project.is_active} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        title={language === 'he' ? 'פרויקט חדש' : 'New Project'}
        size="lg"
      >
        <ProjectForm
          clients={[client]}
          defaultClientId={client.id}
          onSuccess={() => window.location.reload()}
          onCancel={() => setShowCreateProject(false)}
        />
      </Modal>
    </div>
  )
}
