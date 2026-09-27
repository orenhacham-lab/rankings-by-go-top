'use client'

/**
 * ArticleContentEditor — lean TipTap editor for article body (Phase 3A).
 * StarterKit + Link + Table (minimal). No image upload, no bucket dependency.
 * Table extensions are registered so generated <table> markup renders as a real
 * table and survives edit/save (StarterKit alone would drop table nodes and
 * flatten them into plain text). Emits HTML.
 */

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { useEffect } from 'react'
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
        class: 'article-content max-w-none min-h-[320px] focus:outline-none px-3 py-2 text-slate-800 dark:text-slate-100',
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
    return <div className="min-h-[320px] rounded-lg border border-slate-200 dark:border-slate-700 animate-pulse" />
  }

  const btn = (active: boolean) =>
    `px-2 py-1 text-sm rounded border transition ${
      active
        ? 'bg-indigo-600 text-white border-indigo-600'
        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
    }`

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
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="flex flex-wrap gap-1 p-2 border-b border-slate-200 dark:border-slate-700">
        <button type="button" className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title={tb.heading2} aria-label={tb.heading2}>H2</button>
        <button type="button" className={btn(editor.isActive('heading', { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title={tb.heading3} aria-label={tb.heading3}>H3</button>
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} title={tb.bold} aria-label={tb.bold}><strong>B</strong></button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} title={tb.italic} aria-label={tb.italic}><em>I</em></button>
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()}>• {tb.bulletList}</button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. {tb.orderedList}</button>
        <button type="button" className={btn(editor.isActive('link'))} onClick={setLink}>{tb.link}</button>
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-700" aria-hidden />
        {editor.isActive('table') ? (
          <>
            <button type="button" className={btn(false)} onClick={() => editor.chain().focus().addColumnAfter().run()} title={tb.addColumn}>+ {tb.column}</button>
            <button type="button" className={btn(false)} onClick={() => editor.chain().focus().addRowAfter().run()} title={tb.addRow}>+ {tb.row}</button>
            <button type="button" className={btn(false)} onClick={() => editor.chain().focus().deleteTable().run()} title={tb.deleteTable}>⌫ {tb.table}</button>
          </>
        ) : (
          <button type="button" className={btn(false)} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} title={tb.insertTable}>▦ {tb.table}</button>
        )}
        <span className="mx-1 w-px self-stretch bg-slate-200 dark:bg-slate-700" aria-hidden />
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().undo().run()} title={tb.undo} aria-label={tb.undo}>↶</button>
        <button type="button" className={btn(false)} onClick={() => editor.chain().focus().redo().run()} title={tb.redo} aria-label={tb.redo}>↷</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
