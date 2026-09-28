'use client'

import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useCallback, useEffect, useState } from 'react'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, RemoveFormatting, Unlink } from 'lucide-react'
import Button from '@/components/ui/Button'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { NoticeBox } from '@/components/ui/Notice'
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
          // Written into the saved article HTML: the site's link colour tokens.
          class: 'text-action underline underline-offset-2 hover:text-action-hover',
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

  // The link's address is asked for in a row under the toolbar, not in the
  // browser's prompt box; a refused address is said there too, not in an alert.
  const [linkDraft, setLinkDraft] = useState<string | null>(null)
  const [linkRefused, setLinkRefused] = useState(false)

  const openLink = useCallback(() => {
    if (!editor) return
    const prev = (editor.getAttributes('link').href as string | undefined) ?? ''
    setLinkRefused(false)
    setLinkDraft(prev || 'https://')
  }, [editor])

  const closeLink = useCallback(() => {
    setLinkDraft(null)
    setLinkRefused(false)
    editor?.commands.focus()
  }, [editor])

  const applyLink = useCallback(() => {
    if (!editor || linkDraft === null) return
    const trimmed = linkDraft.trim()
    if (trimmed === '' || trimmed === 'https://') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      closeLink()
      return
    }
    // Block dangerous schemes on the client (server sanitization blocks them too)
    if (/^\s*javascript:/i.test(trimmed)) {
      setLinkRefused(true)
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
    closeLink()
  }, [editor, linkDraft, closeLink])

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
        <button type="button" onClick={openLink} className={btn((state?.isLink ?? false) || linkDraft !== null)} aria-expanded={linkDraft !== null} title="הוספה או עריכה של קישור"><Link2 aria-hidden className="size-4" />קישור</button>
        {state?.isLink && (
          <button type="button" onClick={removeLink} className={cn(btn(false), 'text-bad hover:bg-bad-soft hover:text-bad')} title="הסרת הקישור"><Unlink aria-hidden className="size-4" />הסרה</button>
        )}
        {sep}
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)}><RemoveFormatting aria-hidden className="size-4" />ניקוי עיצוב</button>
      </div>
      {linkDraft !== null && (
        <div className="space-y-2 border-b border-line bg-surface p-3" data-link-editor>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="article-link-url" className="sr-only">כתובת הקישור</label>
            <input
              id="article-link-url"
              type="url"
              dir="ltr"
              autoFocus
              value={linkDraft}
              onChange={(e) => { setLinkDraft(e.target.value); setLinkRefused(false) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink() }
                if (e.key === 'Escape') { e.preventDefault(); closeLink() }
              }}
              placeholder="https://"
              aria-invalid={linkRefused || undefined}
              className={cn(FIELD_CLASSES, 'h-8 min-w-0 flex-1 basis-56 text-left')}
            />
            <Button type="button" size="sm" onClick={applyLink}>החלה</Button>
            <Button type="button" size="sm" variant="ghost" onClick={closeLink}>ביטול</Button>
          </div>
          {linkRefused && <NoticeBox tone="bad" language="he">קישור מסוג javascript: אינו מותר. הזינו כתובת שמתחילה ב-<bdi dir="ltr">https://</bdi></NoticeBox>}
        </div>
      )}
      <EditorContent
        editor={editor}
        className="article-editor-content min-h-[420px] max-w-none p-5 text-copy leading-relaxed text-body focus:outline-none [&_.ProseMirror]:min-h-[400px] [&_.ProseMirror]:outline-none [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-title [&_h2]:font-bold [&_h2]:text-ink [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-section [&_h3]:font-bold [&_h3]:text-ink [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pe-0 [&_ul]:ps-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:ps-6 [&_a]:text-action [&_a]:underline [&_blockquote]:my-4 [&_blockquote]:border-s-4 [&_blockquote]:border-line-strong [&_blockquote]:ps-4 [&_blockquote]:text-muted"
      />
    </div>
  )
}
