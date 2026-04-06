'use client'

import { useState, useEffect, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Client, Project } from '@/lib/supabase/types'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

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
        טוען...
      </div>
    )
  }

  if (!client) {
    return <div className="text-center py-20 text-slate-400">לקוח לא נמצא</div>
  }

  return (
    <div>
      <Header
        title={client.name}
        subtitle="פרטי לקוח"
        actions={
          <Link href="/clients">
            <Button variant="outline">← חזרה ללקוחות</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <Card className="lg:col-span-1">
          <h3 className="font-semibold text-slate-800 mb-4">פרטי לקוח</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">שם לקוח</dt>
              <dd className="font-medium">{client.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">איש קשר</dt>
              <dd className="font-medium">{client.contact_name || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">אימייל</dt>
              <dd className="font-medium">{client.email || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">טלפון</dt>
              <dd className="font-medium">{client.phone || '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">סטטוס</dt>
              <dd><ActiveBadge active={client.is_active} /></dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">הוסף בתאריך</dt>
              <dd>{formatDate(client.created_at)}</dd>
            </div>
          </dl>
          {client.notes && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-1">הערות</p>
              <p className="text-sm text-slate-700">{client.notes}</p>
            </div>
          )}
        </Card>

        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800">פרויקטים ({projects.length})</h3>
            <Link href={`/projects/new?client_id=${client.id}`}>
              <Button size="sm">+ פרויקט חדש</Button>
            </Link>
          </div>

          {projects.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-slate-400 mb-4">אין פרויקטים ללקוח זה עדיין</p>
              <Link href={`/projects/new?client_id=${client.id}`}>
                <Button>הוסף פרויקט ראשון</Button>
              </Link>
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
                      עודכן {formatDate(project.updated_at)}
                    </p>
                  </div>
                  <ActiveBadge active={project.is_active} />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
