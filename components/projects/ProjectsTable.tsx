'use client'

import { useState } from 'react'
import { Project, Client } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import RowMenu, { type RowMenuItem } from '@/components/ui/RowMenu'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { PauseCircle, Pencil, PlayCircle, Search, Trash2 } from 'lucide-react'
import ProjectForm from './ProjectForm'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import { formatDate } from '@/lib/utils'
import { toggleProjectActiveAction, deleteProjectAction } from '@/app/actions/projects'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import Link from 'next/link'
import { useActiveProject } from '@/lib/active-project/ActiveProjectProvider'

interface ProjectsTableProps {
  projects: (Project & { clients?: Client })[]
  clients: Client[]
  showClient?: boolean
  onProjectsChange?: () => Promise<void>
}

export default function ProjectsTable({ projects, clients, showClient = true, onProjectsChange }: ProjectsTableProps) {
  const { language, uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)
  // The top bar's switcher lists the active projects. Every change made here
  // (a rename, deactivating, reactivating, deleting) reloads that list, or the
  // switcher would keep offering what this table just changed.
  const { reloadProjects } = useActiveProject()

  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [deletingProject, setDeletingProject] = useState<Project | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // UX review P2-2 ("does not handle weekly"): there is no weekly any more. Phase 3
  // converted every weekly project to monthly and the column's CHECK allows only
  // manual | monthly, so naming "weekly" here would describe a cadence that never
  // runs. What was wrong is the fallback: an unknown value went to a Hebrew-only
  // helper, so the English screen showed "ידני". Every value now reads in the
  // screen's language.
  function localizedFrequency(freq: string): string {
    const f = dict.projects.frequency
    return freq === 'monthly' ? f.monthly : f.manual
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
      reloadProjects()
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <div className="relative mb-4 w-full max-w-sm">
        <Search aria-hidden className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
        <input
          type="search"
          placeholder={dict.projects.searchPlaceholder}
          aria-label={dict.projects.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(FIELD_CLASSES, 'h-10 ps-9')}
        />
      </div>

      {/* PRIORITY COLUMNS: a phone shows the project (its domain under the name),
          its status and the actions; client, cadence and last check return as the
          screen widens. The domain has its own column from md up. */}
      <Table>
        <TableHead>
          <tr className="max-sm:[&>th]:px-2.5">
            <Th>{dict.projects.table.projectName}</Th>
            {showClient && <Th className="hidden md:table-cell">{dict.projects.table.client}</Th>}
            <Th className="hidden md:table-cell">{dict.projects.table.domain}</Th>
            <Th className="hidden lg:table-cell">{dict.projects.table.frequency}</Th>
            <Th className="hidden md:table-cell">{dict.projects.table.lastScan}</Th>
            <Th>{dict.projects.table.status}</Th>
            <Th><span className="sr-only">{dict.projects.table.actions}</span></Th>
          </tr>
        </TableHead>
        <TableBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={showClient ? 7 : 6} message={dict.projects.table.emptyState} />
          )}
          {filtered.map((project) => {
            // The same three actions as before, behind "⋯" like every other table:
            // delete only opens the confirmation dialog.
            const menu: RowMenuItem[] = [
              { key: 'edit', label: dict.projects.actions.edit, icon: <Pencil aria-hidden="true" className="size-4" />, onSelect: () => setEditingProject(project) },
              {
                key: 'toggle', label: project.is_active ? dict.projects.actions.deactivate : dict.projects.actions.activate,
                disabled: togglingId === project.id,
                icon: project.is_active ? <PauseCircle aria-hidden="true" className="size-4" /> : <PlayCircle aria-hidden="true" className="size-4" />,
                onSelect: () => { void handleToggleActive(project) },
              },
              { key: 'delete', label: dict.projects.actions.delete, danger: true, icon: <Trash2 aria-hidden="true" className="size-4" />, onSelect: () => setDeletingProject(project) },
            ]
            return (
            <TableRow key={project.id} className="max-sm:[&>td]:px-2.5">
              <Td className="min-w-[10rem]">
                {/* A project opens as the current project, on its dashboard. An
                    inactive one has no workspace to open until it is reactivated. */}
                {project.is_active ? (
                  <Link
                    href={`/dashboard?projectId=${encodeURIComponent(project.id)}`}
                    className="font-semibold text-ink hover:text-action hover:underline"
                  >
                    {project.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-muted">{project.name}</span>
                )}
                <p dir="ltr" className="mt-0.5 max-w-[12rem] truncate text-start text-caption text-muted md:hidden">{project.target_domain}</p>
              </Td>
              {showClient && (
                <Td className="hidden md:table-cell">
                  {project.clients ? (
                    <Link href={`/clients/${project.clients.id}`} className="text-copy text-body hover:text-action hover:underline">
                      {project.clients.name}
                    </Link>
                  ) : <span className="text-muted">—</span>}
                </Td>
              )}
              <Td className="hidden md:table-cell"><span dir="ltr" title={project.target_domain} className="block max-w-64 truncate text-caption text-muted">{project.target_domain}</span></Td>
              <Td className="hidden lg:table-cell">
                <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
                  {localizedFrequency(project.scan_frequency)}
                </Badge>
              </Td>
              <Td className="hidden md:table-cell">
                <span className="whitespace-nowrap text-caption text-muted">
                  {project.last_scan_at ? formatDate(project.last_scan_at, language) : dict.projects.table.neverScanned}
                </span>
              </Td>
              <Td>
                <ActiveBadge active={project.is_active} />
              </Td>
              <Td className="w-12">
                <RowMenu label={dict.projects.table.moreActions(project.name)} items={menu} />
              </Td>
            </TableRow>
            )
          })}
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
            onSuccess={() => { setEditingProject(null); reloadProjects() }}
            onCancel={() => setEditingProject(null)}
          />
        </Modal>
      )}

      {deletingProject && (
        <DeleteConfirmDialog
          open={!!deletingProject}
          name={deletingProject.name}
          labels={dict.projects.deleteDialog}
          onConfirm={() => deleteProjectAction(deletingProject.id)}
          onClose={() => setDeletingProject(null)}
          onDeleted={async () => { reloadProjects(); if (onProjectsChange) await onProjectsChange() }}
        />
      )}
    </>
  )
}
