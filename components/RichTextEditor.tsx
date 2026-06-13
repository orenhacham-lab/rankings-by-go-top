'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Image } from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function RichTextEditor({ value, onChange, placeholder = 'כתוב את המאמר כאן...' }: RichTextEditorProps) {
  const [uploading, setUploading] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded-lg my-4',
        },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: {
          class: 'text-blue-600 underline hover:text-blue-700',
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return

    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const sanitizedName = `article-${Date.now()}.${ext}`

      const { data, error } = await supabase.storage
        .from('article-images')
        .upload(sanitizedName, file)

      if (error) {
        console.error('Upload error:', error)
        alert('שגיאה בהעלאת התמונה')
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('article-images')
        .getPublicUrl(sanitizedName)

      // Insert image with alt text
      const altText = prompt('הכנס alt text לתמונה:') || 'תמונה'
      editor.chain().focus().setImage({ src: publicUrl, alt: altText }).run()
    } catch (error) {
      console.error('Error:', error)
      alert('שגיאה בהעלאת התמונה')
    } finally {
      setUploading(false)
    }
  }

  if (!editor) {
    return null
  }

  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="bg-slate-50 border-b border-slate-300 p-4 flex flex-wrap gap-2">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('bold')
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>

        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('italic')
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>

        <div className="border-l border-slate-300 mx-1" />

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Heading 2"
        >
          H2
        </button>

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Heading 3"
        >
          H3
        </button>

        <div className="border-l border-slate-300 mx-1" />

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('bulletList')
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Bullet List"
        >
          • רשימה
        </button>

        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('orderedList')
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="Ordered List"
        >
          1. רשימה
        </button>

        <div className="border-l border-slate-300 mx-1" />

        <button
          onClick={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
          className="px-3 py-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium transition-colors"
          title="Insert Table"
        >
          📊 טבלה
        </button>

        <div className="border-l border-slate-300 mx-1" />

        <label className="px-3 py-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium transition-colors cursor-pointer flex items-center gap-2">
          🖼️ תמונה
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>

        <button
          onClick={() => {
            const previousUrl = editor.getAttributes('link').href
            const url = window.prompt('הכנס כתובת URL:', previousUrl || 'https://')

            if (url === null) return

            if (url === '') {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              return
            }

            editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
          }}
          className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
            editor.isActive('link')
              ? 'bg-blue-500 text-white border-blue-600'
              : 'bg-white border-slate-300 hover:bg-slate-100'
          }`}
          title="הוסף לינק"
        >
          🔗 לינק
        </button>

        {editor.isActive('link') && (
          <button
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="px-3 py-2 rounded border border-red-300 bg-white hover:bg-red-50 text-sm font-medium text-red-600 transition-colors"
            title="הסר לינק"
          >
            ❌ הסר לינק
          </button>
        )}

        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className="px-3 py-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium transition-colors disabled:opacity-50"
          title="Undo"
        >
          ↶
        </button>

        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className="px-3 py-2 rounded border border-slate-300 bg-white hover:bg-slate-100 text-sm font-medium transition-colors disabled:opacity-50"
          title="Redo"
        >
          ↷
        </button>
      </div>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 min-h-96 focus:outline-none [&_p]:text-slate-700 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-2 [&_table]:border-collapse [&_table]:w-full [&_table]:border [&_table]:border-slate-300 [&_table_th]:border [&_table_th]:border-slate-300 [&_table_th]:bg-slate-100 [&_table_th]:p-2 [&_table_td]:border [&_table_td]:border-slate-300 [&_table_td]:p-2 [&_ul]:list-disc [&_ul]:list-inside [&_ol]:list-decimal [&_ol]:list-inside"
      />

      {uploading && (
        <div className="p-4 bg-blue-50 text-blue-700 text-sm">
          מעלה תמונה...
        </div>
      )}
    </div>
  )
}
