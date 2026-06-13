'use client'

import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useCallback, useEffect } from 'react'

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
    `px-2.5 py-1.5 rounded text-sm font-medium border transition-colors ${
      active
        ? 'bg-indigo-50 text-indigo-700 border-indigo-400'
        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
    }`

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-slate-200 bg-slate-50 sticky top-0 z-10">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(state?.isBold ?? false)} title="מודגש"><strong>B</strong></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(state?.isItalic ?? false)} title="נטוי"><em>I</em></button>
        <span className="w-px bg-slate-300 mx-1 self-stretch" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(state?.isH2 ?? false)}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(state?.isH3 ?? false)}>H3</button>
        <span className="w-px bg-slate-300 mx-1 self-stretch" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(state?.isBullet ?? false)}>• רשימה</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(state?.isOrdered ?? false)}>1. רשימה</button>
        <span className="w-px bg-slate-300 mx-1 self-stretch" />
        <button type="button" onClick={setLink} className={btn(state?.isLink ?? false)} title="הוסף/ערוך קישור">🔗 קישור</button>
        {state?.isLink && (
          <button type="button" onClick={removeLink} className="px-2.5 py-1.5 rounded text-sm font-medium border border-red-300 bg-white text-red-600 hover:bg-red-50 transition-colors" title="הסר קישור">❌ הסר</button>
        )}
        <span className="w-px bg-slate-300 mx-1 self-stretch" />
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)}>✕ נקה</button>
      </div>
      <EditorContent
        editor={editor}
        className="article-editor-content max-w-none p-5 min-h-[420px] text-slate-700 leading-relaxed focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[400px] [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-900 [&_h3]:mt-5 [&_h3]:mb-2 [&_p]:mb-4 [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pr-6 [&_ul]:mb-4 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pr-6 [&_ol]:mb-4 [&_ol]:space-y-1 [&_a]:text-blue-600 [&_a]:underline [&_blockquote]:border-r-4 [&_blockquote]:border-slate-300 [&_blockquote]:pr-4 [&_blockquote]:text-slate-600 [&_blockquote]:my-4"
      />
    </div>
  )
}
