'use client'

import { useState } from 'react'
import { Client } from '@/lib/supabase/types'
import { Table, TableHead, TableBody, TableRow, Th, Td, EmptyRow } from '@/components/ui/Table'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import RowMenu, { type RowMenuItem } from '@/components/ui/RowMenu'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { PauseCircle, Pencil, PlayCircle, Search, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import ClientForm from './ClientForm'
import DeleteConfirmDialog from '@/components/ui/DeleteConfirmDialog'
import { formatDate } from '@/lib/utils'
import { toggleClientActiveAction, deleteClientAction } from '@/app/actions/clients'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import Link from 'next/link'

interface ClientsTableProps {
  clients: Client[]
  onClientsChange?: () => Promise<void>
}

export default function ClientsTable({ clients, onClientsChange }: ClientsTableProps) {
  const { uiLocale } = useDashboardLanguage()
  const dict = getDashboardDictionary(uiLocale)

  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deletingClient, setDeletingClient] = useState<Client | null>(null)
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
      <div className="relative mb-4 w-full max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
        <input
          type="search"
          placeholder={dict.clients.searchPlaceholder}
          aria-label={dict.clients.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn(FIELD_CLASSES, 'h-10 ps-9')}
        />
      </div>

      <Table>
        <TableHead>
          <tr>
            <Th>{dict.clients.table.clientName}</Th>
            <Th className="hidden md:table-cell">{dict.clients.table.contactName}</Th>
            <Th className="hidden lg:table-cell">{dict.clients.table.email}</Th>
            <Th className="hidden lg:table-cell">{dict.clients.table.phone}</Th>
            <Th>{dict.clients.table.status}</Th>
            <Th className="hidden md:table-cell">{dict.clients.table.createdAt}</Th>
            <Th><span className="sr-only">{dict.clients.table.actions}</span></Th>
          </tr>
        </TableHead>
        <TableBody>
          {filtered.length === 0 && (
            <EmptyRow colSpan={7} message={dict.clients.table.emptyState} />
          )}
          {filtered.map((client) => {
            // One menu per row, like the projects table: delete only opens the confirmation.
            const menu: RowMenuItem[] = [
              { key: 'edit', label: dict.clients.actions.edit, icon: <Pencil aria-hidden="true" className="size-4" />, onSelect: () => setEditingClient(client) },
              {
                key: 'toggle', label: client.is_active ? dict.clients.actions.deactivate : dict.clients.actions.activate,
                disabled: togglingId === client.id,
                icon: client.is_active ? <PauseCircle aria-hidden="true" className="size-4" /> : <PlayCircle aria-hidden="true" className="size-4" />,
                onSelect: () => { void handleToggleActive(client) },
              },
              { key: 'delete', label: dict.clients.actions.delete, danger: true, icon: <Trash2 aria-hidden="true" className="size-4" />, onSelect: () => setDeletingClient(client) },
            ]
            return (
            <TableRow key={client.id}>
              <Td className="min-w-[10rem]">
                <Link href={`/clients/${client.id}`} className="font-semibold text-ink hover:text-action hover:underline">
                  {client.name}
                </Link>
              </Td>
              <Td className="hidden md:table-cell">{client.contact_name || '—'}</Td>
              <Td className="hidden lg:table-cell"><span dir="ltr" className="block max-w-64 truncate text-caption text-muted">{client.email || '—'}</span></Td>
              <Td className="hidden lg:table-cell"><span dir="ltr" className="tabular-nums">{client.phone || '—'}</span></Td>
              <Td>
                <ActiveBadge active={client.is_active} />
              </Td>
              <Td className="hidden md:table-cell"><span className="whitespace-nowrap text-caption text-muted">{formatDate(client.created_at)}</span></Td>
              <Td className="w-12">
                <RowMenu label={dict.clients.table.moreActions(client.name)} items={menu} />
              </Td>
            </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {editingClient && (
        <Modal
          open={!!editingClient}
          onClose={() => setEditingClient(null)}
          title={dict.clients.modal.editTitle}
          size="md"
        >
          <ClientForm
            client={editingClient}
            onSuccess={() => setEditingClient(null)}
            onCancel={() => setEditingClient(null)}
          />
        </Modal>
      )}

      {deletingClient && (
        <DeleteConfirmDialog
          open={!!deletingClient}
          name={deletingClient.name}
          labels={dict.clients.deleteDialog}
          onConfirm={() => deleteClientAction(deletingClient.id)}
          onClose={() => setDeletingClient(null)}
          onDeleted={async () => { if (onClientsChange) await onClientsChange() }}
        />
      )}
    </>
  )
}
