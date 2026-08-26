'use client'

import { useState } from 'react'
import Link from 'next/link'

interface ProjectOption {
  id: string
  label: string
}

export default function ShopifyLinkClient({ shopDomain, projects }: { shopDomain: string; projects: ProjectOption[] }) {
  const [selected, setSelected] = useState<string>(projects[0]?.id ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/shopify/link/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selected }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Something went wrong.')
        setSubmitting(false)
        return
      }
      window.location.href = json.redirectUrl || `/content?projectId=${encodeURIComponent(selected)}`
    } catch {
      setError('Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Connect {shopDomain}</h1>
      <p style={{ color: '#616161', marginBottom: 20 }}>Choose which Rankings project this store belongs to.</p>

      {projects.length === 0 ? (
        <p style={{ color: '#616161', marginBottom: 20 }}>You don&apos;t have any projects yet.</p>
      ) : (
        <div style={{ marginBottom: 20 }}>
          {projects.map((p) => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', cursor: 'pointer' }}>
              <input type="radio" name="project" value={p.id} checked={selected === p.id} onChange={() => setSelected(p.id)} />
              <span>{p.label}</span>
            </label>
          ))}
        </div>
      )}

      {error && <p style={{ color: '#b71c1c', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12 }}>
        {projects.length > 0 && (
          <button onClick={submit} disabled={submitting || !selected} style={buttonStyle}>
            {submitting ? 'Connecting…' : 'Connect this project'}
          </button>
        )}
        <Link href="/projects/new" style={{ ...buttonStyle, background: '#fff', color: '#008060', border: '1px solid #008060', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
          Create a new project
        </Link>
      </div>
      <p style={{ color: '#8c9196', fontSize: 12, marginTop: 12 }}>
        Created a new project? Come back to this page to finish connecting {shopDomain}.
      </p>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  background: '#008060', color: '#fff', border: 'none', borderRadius: 6,
  padding: '10px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
}
