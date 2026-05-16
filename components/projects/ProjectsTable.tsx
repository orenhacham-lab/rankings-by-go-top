'use client'

import { useState } from 'react'
import { Project, Client } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from './ProjectForm'
import { formatDate, getFrequencyLabel } from '@/lib/utils'
import { toggleProjectActiveAction } from '@/app/actions/projects'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import Link from 'next/link'

interface ProjectsTableProps {
  projects: (Project & { clients?: Client })[]
  clients: Client[]
  showClient?: boolean
}

export default function ProjectsTable({ projects, clients, showClient = true }: ProjectsTableProps) {
  const { language, isLoaded } = useDashboardLanguage()
  const dict = isLoaded ? getDashboardDictionary(language) : getDashboardDictionary('he')

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  function localizedFrequency(freq: string): string {
    if (freq === 'weekly') return dict.projects.frequency.weekly
    if (freq === 'monthly') return dict.projects.frequency.monthly
    if (freq === 'monthly_first_day') return dict.projects.frequency.monthlyFirstDay
    if (freq === 'manual') return dict.projects.frequency.manual
    return getFrequencyLabel(freq)
  }

  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.target_domain.toLowerCase().includes(search.toLowerCase())
  )

  async function handleToggleActive(project: Project) {
    setTogglingId(project.id)
    try {
      await toggleProjectActiveAction(project.id, project.is_active)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          placeholder={dict.projects.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
        />
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>{dict.projects.table.projectName}</Th>
            {showClient && <Th>{dict.projects.table.client}</Th>}
            <Th>{dict.projects.table.domain}</Th>
            <Th>{dict.projects.table.frequency}</Th>
            <Th>{dict.projects.table.lastScan}</Th>
            <Th>{dict.projects.table.status}</Th>
            <Th>{dict.projects.table.actions}</Th>
          </tr>
        </TableHead>
        <TableBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={showClient ? 7 : 6} message={dict.projects.table.emptyState} />
          )}
          {filtered.map((project) => (
            <TableRow key={project.id}>
              <Td>
                <Link
                  href={`/projects/${project.id}`}
                  className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {project.name}
                </Link>
              </Td>
              {showClient && (
                <Td>
                  {project.clients ? (
                    <Link href={`/clients/${project.clients.id}`} className="text-slate-600 dark:text-slate-300 hover:underline text-sm">
                      {project.clients.name}
                    </Link>
                  ) : '—'}
                </Td>
              )}
              <Td className="font-mono text-xs text-slate-600 dark:text-slate-300">{project.target_domain}</Td>
              <Td>
                <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
                  {localizedFrequency(project.scan_frequency)}
                </Badge>
              </Td>
              <Td>{project.last_scan_at ? formatDate(project.last_scan_at) : '—'}</Td>
              <Td>
                <ActiveBadge active={project.is_active} />
              </Td>
              <Td>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingProject(project)}
                  >
                    {dict.projects.actions.edit}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={togglingId === project.id}
                    onClick={() => handleToggleActive(project)}
                  >
                    {project.is_active ? dict.projects.actions.deactivate : dict.projects.actions.activate}
                  </Button>
                </div>
              </Td>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingProject && (
        <Modal
          open={!!editingProject}
          onClose={() => setEditingProject(null)}
          title={dict.projects.modal.editTitle}
          size="lg"
        >
          <ProjectForm
            project={editingProject}
            clients={clients}
            onSuccess={() => setEditingProject(null)}
            onCancel={() => setEditingProject(null)}
          />
        </Modal>
      )}
    </>
  )
}
