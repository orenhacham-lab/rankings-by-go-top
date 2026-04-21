'use client'

import { useState } from 'react'
import { Client } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ClientForm from './ClientForm'
import { formatDate } from '@/lib/utils'
import { toggleClientActiveAction } from '@/app/actions/clients'
import Link from 'next/link'

interface ClientsTableProps {
  clients: Client[]
  onClientsChange?: () => Promise<void>
}

export default function ClientsTable({ clients, onClientsChange }: ClientsTableProps) {
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleToggleActive(client: Client) {
    setTogglingId(client.id)
    try {
      await toggleClientActiveAction(client.id, client.is_active)
      if (onClientsChange) {
        await onClientsChange()
      }
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="חיפוש לפי שם, איש קשר, אימייל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>שם לקוח</Th>
            <Th>איש קשר</Th>
            <Th>אימייל</Th>
            <Th>טלפון</Th>
            <Th>סטטוס</Th>
            <Th>תאריך הוספה</Th>
            <Th>פעולות</Th>
          </tr>
        </TableHead>
        <TableBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={7} message="לא נמצאו לקוחות" />
          )}
          {filtered.map((client) => (
            <TableRow key={client.id}>
              <Td>
                <Link
                  href={`/clients/${client.id}`}
                  className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {client.name}
                </Link>
              </Td>
              <Td>{client.contact_name || '—'}</Td>
              <Td>{client.email || '—'}</Td>
              <Td>{client.phone || '—'}</Td>
              <Td>
                <ActiveBadge active={client.is_active} />
              </Td>
              <Td>{formatDate(client.created_at)}</Td>
              <Td>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingClient(client)}
                  >
                    עריכה
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={togglingId === client.id}
                    onClick={() => handleToggleActive(client)}
                  >
                    {client.is_active ? 'השבת' : 'הפעל'}
                  </Button>
                </div>
              </Td>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {editingClient && (
        <Modal
          open={!!editingClient}
          onClose={() => setEditingClient(null)}
          title="עריכת לקוח"
          size="md"
        >
          <ClientForm
            client={editingClient}
            onSuccess={() => setEditingClient(null)}
            onCancel={() => setEditingClient(null)}
          />
        </Modal>
      )}
    </>
  )
}
