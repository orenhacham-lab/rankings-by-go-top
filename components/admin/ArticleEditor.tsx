'use client'

import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useCallback, useEffect } from 'react'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, RemoveFormatting, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ArticleEditorProps {
  value: string
  onChange: (html: string) => void
}

export default function ArticleEditor({ value, onChange }: ArticleEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-700',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Subscribe to the editor's selection/state so the toolbar reflects the active
  // formatting under the cursor. Without useEditorState the toolbar buttons would
  // not re-render on selection changes in @tiptap/react v3.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      isBold: editor?.isActive('bold') ?? false,
      isItalic: editor?.isActive('italic') ?? false,
      isH2: editor?.isActive('heading', { level: 2 }) ?? false,
      isH3: editor?.isActive('heading', { level: 3 }) ?? false,
      isBullet: editor?.isActive('bulletList') ?? false,
      isOrdered: editor?.isActive('orderedList') ?? false,
      isLink: editor?.isActive('link') ?? false,
    }),
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
    const url = window.prompt('כתובת הקישור (URL):', prev || 'https://')
    if (url === null) return // cancelled

    const trimmed = url.trim()
    if (trimmed === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    // Block dangerous schemes on the client (server sanitization blocks them too)
    if (/^\s*javascript:/i.test(trimmed)) {
      window.alert('קישור מסוג javascript: אינו מותר')
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
  }, [editor])

  const removeLink = useCallback(() => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
  }, [editor])

  if (!editor) return null

  const btn = (active: boolean) =>
    cn(
      'inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-caption font-semibold transition-colors duration-150 ease-snappy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
      active ? 'bg-action-soft text-action' : 'text-body hover:bg-surface hover:text-ink',
    )
  const sep = <span aria-hidden className="mx-1 w-px self-stretch bg-line" />

  return (
    <div className="overflow-hidden rounded-inset border border-line bg-surface shadow-control">
      <div role="toolbar" aria-label="עיצוב טקסט" className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-line bg-sunk p-1.5">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(state?.isBold ?? false)} aria-pressed={state?.isBold ?? false} aria-label="מודגש" title="מודגש"><Bold aria-hidden className="size-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(state?.isItalic ?? false)} aria-pressed={state?.isItalic ?? false} aria-label="נטוי" title="נטוי"><Italic aria-hidden className="size-4" /></button>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(state?.isH2 ?? false)} aria-pressed={state?.isH2 ?? false} aria-label="כותרת משנה" title="כותרת משנה"><Heading2 aria-hidden className="size-4" /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(state?.isH3 ?? false)} aria-pressed={state?.isH3 ?? false} aria-label="כותרת קטנה" title="כותרת קטנה"><Heading3 aria-hidden className="size-4" /></button>
        {sep}
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(state?.isBullet ?? false)} aria-pressed={state?.isBullet ?? false}><List aria-hidden className="size-4" />רשימה</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(state?.isOrdered ?? false)} aria-pressed={state?.isOrdered ?? false}><ListOrdered aria-hidden className="size-4" />רשימה ממוספרת</button>
        {sep}
        <button type="button" onClick={setLink} className={btn(state?.isLink ?? false)} title="הוספה או עריכה של קישור"><Link2 aria-hidden className="size-4" />קישור</button>
        {state?.isLink && (
          <button type="button" onClick={removeLink} className={cn(btn(false), 'text-bad hover:bg-bad-soft hover:text-bad')} title="הסרת הקישור"><Unlink aria-hidden className="size-4" />הסרה</button>
        )}
        {sep}
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)}><RemoveFormatting aria-hidden className="size-4" />ניקוי עיצוב</button>
      </div>
      <EditorContent
        editor={editor}
        className="article-editor-content min-h-[420px] max-w-none p-5 text-copy leading-relaxed text-body focus:outline-none [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-title [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-section [&_h3]:font-bold [&_h3]:text-ink [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pe-0 [&_ul]:ps-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:ps-6 [&_a]:text-action [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-s-4 [&_blockquote]:border-line-strong [&_blockquote]:ps-4 [&_blockquote]:text-muted"
      />
    </div>
  )
}
