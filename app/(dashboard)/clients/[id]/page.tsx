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
import { Globe, Plus, Users } from 'lucide-react'
import BackLink from '@/components/ui/BackLink'
import EmptyState from '@/components/ui/EmptyState'
import SiteAvatar from '@/components/ui/SiteAvatar'
import { ScreenSkeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
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
    return <ScreenSkeleton label={k.loading} />
  }

  if (!client) {
    return (
      <div className="space-y-8">
        <BackLink href="/clients">{k.backToClients}</BackLink>
        <Card padding={false}>
          <EmptyState icon={<Users />} title={k.clientNotFound} />
        </Card>
      </div>
    )
  }

  const rows: [string, React.ReactNode][] = [
    [k.clientName, client.name],
    [k.contactName, client.contact_name || '—'],
    [k.email, client.email ? <bdi dir="ltr" className="block max-w-64 truncate">{client.email}</bdi> : '—'],
    [k.phone, client.phone ? <bdi dir="ltr" className="tabular-nums">{client.phone}</bdi> : '—'],
    [k.status, <ActiveBadge key="s" active={client.is_active} />],
    [k.createdAt, formatDate(client.created_at)],
  ]

  return (
    <div>
      <BackLink href="/clients" className="mb-2">{k.backToClients}</BackLink>
      <Header title={client.name} subtitle={k.details} />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-3">
        <Card padding={false} className="p-5 sm:p-6 lg:col-span-1">
          <h2 className="mb-4 text-section font-semibold text-ink">{k.details}</h2>
          <dl className="divide-y divide-line">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt className="text-caption text-muted">{label}</dt>
                <dd className="min-w-0 text-end text-copy font-medium text-ink">{value}</dd>
              </div>
            ))}
          </dl>
          {client.notes && (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-1 text-caption text-muted">{k.notes}</p>
              <p className="max-w-prose text-copy text-body">{client.notes}</p>
            </div>
          )}
        </Card>

        <section aria-labelledby="client-projects-title" className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="client-projects-title" className="text-section font-semibold text-ink">
              {k.projects} <span className="tabular-nums text-muted">({projects.length})</span>
            </h2>
            {projects.length > 0 && (
              <Button size="sm" onClick={() => setShowCreateProject(true)}>
                <Plus aria-hidden="true" className="size-4" />
                {k.newProject}
              </Button>
            )}
          </div>

          {projects.length === 0 ? (
            <Card padding={false}>
              <EmptyState
                icon={<Globe />}
                title={k.emptyTitle}
                body={k.emptyBody}
                action={
                  <Button size="sm" onClick={() => setShowCreateProject(true)}>
                    <Plus aria-hidden="true" className="size-4" />
                    {k.addFirstProject}
                  </Button>
                }
              />
            </Card>
          ) : (
            <ul className="list-enter space-y-3">
              {projects.map((project) => (
                <li key={project.id}>
                  <Card padding={false} className="flex items-center justify-between gap-4 p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <SiteAvatar domain={project.target_domain} name={project.name} size="md" />
                      <div className="min-w-0">
                        {/* Opens as the current project, on its dashboard; an inactive
                            project has no workspace to open until it is reactivated. */}
                        {project.is_active ? (
                          <Link
                            href={`/dashboard?projectId=${encodeURIComponent(project.id)}`}
                            className="text-copy font-semibold text-ink hover:text-action hover:underline"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          <span className="text-copy font-semibold text-muted">{project.name}</span>
                        )}
                        <p dir="ltr" title={project.target_domain} className="max-w-64 truncate text-start text-caption text-muted">{project.target_domain}</p>
                        <p className="text-caption text-muted">
                          {project.city && `${project.city} · `}
                          {k.updated} {formatDate(project.updated_at)}
                        </p>
                      </div>
                    </div>
                    <ActiveBadge active={project.is_active} />
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        title={dict.projects.modal.newTitle}
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
