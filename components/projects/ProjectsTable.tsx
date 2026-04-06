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
import Link from 'next/link'

interface ProjectsTableProps {
  projects: (Project & { clients?: Client })[]
  clients: Client[]
  showClient?: boolean
}

export default function ProjectsTable({ projects, clients, showClient = true }: ProjectsTableProps) {
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

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
          placeholder="חיפוש לפי שם פרויקט, דומיין..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>שם פרויקט</Th>
            {showClient && <Th>לקוח</Th>}
            <Th>דומיין</Th>
            <Th>תדירות</Th>
            <Th>סריקה אחרונה</Th>
            <Th>סטטוס</Th>
            <Th>פעולות</Th>
          </tr>
        </TableHead>
        <TableBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={showClient ? 7 : 6} message="לא נמצאו פרויקטים" />
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
                    <Link href={`/clients/${project.clients.id}`} className="text-slate-600 hover:underline text-sm">
                      {project.clients.name}
                    </Link>
                  ) : '—'}
                </Td>
              )}
              <Td className="font-mono text-xs text-slate-600">{project.target_domain}</Td>
              <Td>
                <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
                  {getFrequencyLabel(project.scan_frequency)}
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
                    עריכה
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={togglingId === project.id}
                    onClick={() => handleToggleActive(project)}
                  >
                    {project.is_active ? 'השבת' : 'הפעל'}
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
          title="עריכת פרויקט"
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
