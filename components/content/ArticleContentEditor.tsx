'use client'

/**
 * ArticleContentEditor — lean TipTap editor for article body (Phase 3A).
 * StarterKit + Link + Table (minimal). No image upload, no bucket dependency.
 * Table extensions are registered so generated <table> markup renders as a real
 * table and survives edit/save (StarterKit alone would drop table nodes and
 * flatten them into plain text). Emits HTML.
 */

import { Skeleton } from '@/components/ui/Skeleton'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { useEffect, type ReactNode } from 'react'
import { BetweenHorizontalEnd, BetweenVerticalEnd, Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Redo2, Table as TableIcon, Trash2, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export default function ArticleContentEditor({
  value,
  onChange,
  dir = 'rtl',
}: {
  value: string
  onChange: (html: string) => void
  dir?: 'rtl' | 'ltr'
}) {
  // The toolbar speaks the dashboard's language (it was English-only); the
  // article's own direction still comes from `dir`, the article's language.
  const { language } = useDashboardLanguage()
  const tb = getDashboardDictionary(language).articleEditorToolbar
  const editor = useEditor({
    immediatelyRender: false, // required for SSR (Next.js)
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'article-content max-w-none min-h-[320px] focus:outline-none px-4 py-3 text-ink',
        dir,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sync external content into the editor (e.g. after the article loads).
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (value && value !== current) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  if (!editor) {
    return <Skeleton className="min-h-[320px] rounded-control border border-line" />
  }

  // One toolbar button: a lucide icon with its name for screen readers and as a
  // tooltip; `text` adds a short visible word where the icon alone is ambiguous.
  const tool = (key: string, label: string, icon: ReactNode, onClick: () => void, active = false, text?: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-control px-2 text-caption font-semibold transition-colors duration-150 ease-snappy',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&_svg]:size-4',
        active ? 'bg-action-soft text-action' : 'text-body hover:bg-sunk hover:text-ink',
      )}
    >
      {icon}{text && <span aria-hidden="true">{text}</span>}
    </button>
  )

  function setLink() {
    const prev = editor!.getAttributes('link').href as string | undefined
    const url = window.prompt(tb.linkPrompt, prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor!.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="overflow-hidden rounded-control border border-line bg-surface shadow-control">
      <div role="toolbar" aria-label={tb.label} className="flex flex-wrap items-center gap-0.5 border-b border-line bg-sunk/60 p-1.5">
        {tool('h2', tb.heading2, <Heading2 aria-hidden="true" />, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {tool('h3', tb.heading3, <Heading3 aria-hidden="true" />, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), editor.isActive('heading', { level: 3 }))}
        {tool('bold', tb.bold, <Bold aria-hidden="true" />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {tool('italic', tb.italic, <Italic aria-hidden="true" />, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {tool('ul', tb.bulletList, <List aria-hidden="true" className="rtl:-scale-x-100" />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
        {tool('ol', tb.orderedList, <ListOrdered aria-hidden="true" className="rtl:-scale-x-100" />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
        {tool('link', tb.link, <Link2 aria-hidden="true" />, setLink, editor.isActive('link'))}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {editor.isActive('table') ? (
          <>
            {tool('col', tb.addColumn, <BetweenVerticalEnd aria-hidden="true" />, () => editor.chain().focus().addColumnAfter().run(), false, tb.column)}
            {tool('row', tb.addRow, <BetweenHorizontalEnd aria-hidden="true" />, () => editor.chain().focus().addRowAfter().run(), false, tb.row)}
            {tool('deltable', tb.deleteTable, <Trash2 aria-hidden="true" />, () => editor.chain().focus().deleteTable().run(), false, tb.table)}
          </>
        ) : (
          tool('table', tb.insertTable, <TableIcon aria-hidden="true" />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), false, tb.table)
        )}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
        {tool('undo', tb.undo, <Undo2 aria-hidden="true" className="rtl:-scale-x-100" />, () => editor.chain().focus().undo().run())}
        {tool('redo', tb.redo, <Redo2 aria-hidden="true" className="rtl:-scale-x-100" />, () => editor.chain().focus().redo().run())}
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
