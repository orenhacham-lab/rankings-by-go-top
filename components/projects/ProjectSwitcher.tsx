'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface ProjectOption {
  id: string
  name: string
}

interface ProjectSwitcherProps {
  currentProjectId: string
  currentProjectName?: string | null
}

/**
 * Read-only navigation dropdown: lists the current user's projects (via the
 * existing /api/projects endpoint, which already enforces user_id=auth.uid())
 * and navigates to the selected one. No auth, DB, or data changes.
 */
export default function ProjectSwitcher({
  currentProjectId,
  currentProjectName,
}: ProjectSwitcherProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch('/api/projects')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (Array.isArray(data?.projects)) {
          setProjects(data.projects as ProjectOption[])
        }
      })
      .catch(() => {
        // Silent fail — the dropdown stays usable showing just the current
        // project; navigation to other projects via the /projects index page
        // remains available as a fallback.
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextId = e.target.value
    if (!nextId || nextId === currentProjectId) return
    const qs = searchParams.toString()
    router.push(`/projects/${nextId}${qs ? `?${qs}` : ''}`)
  }

  // Ensure the current project always appears in the list, even before the
  // fetch resolves or if the API call fails.
  const options: ProjectOption[] = (() => {
    const hasCurrent = projects.some((p) => p.id === currentProjectId)
    if (hasCurrent) return projects
    return [
      { id: currentProjectId, name: currentProjectName || currentProjectId },
      ...projects,
    ]
  })()

  return (
    <select
      value={currentProjectId}
      onChange={handleChange}
      disabled={loading && projects.length === 0}
      aria-label="Switch project"
      className="px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-colors max-w-[14rem] truncate"
    >
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )
}
