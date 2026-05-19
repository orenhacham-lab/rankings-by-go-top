'use client'

import { useState } from 'react'
import { X, Loader2, CheckCircle } from 'lucide-react'
import { GeneratedQuestion } from '@/lib/ai-questions/generate-questions'

interface AIQuestionsModalProps {
  open: boolean
  onClose: () => void
  questions: GeneratedQuestion[]
  selectedProject: string
  projects: Array<{ id: string; name: string }>
  language: 'he' | 'en'
  isRTL: boolean
  onAddQuestions: (questions: GeneratedQuestion[]) => Promise<void>
  loading?: boolean
  successMessage?: string
}

const typeLabels = {
  he: {
    recommendation: 'המלצה',
    price: 'מחיר',
    comparison: 'השוואה',
    info: 'מידע',
  },
  en: {
    recommendation: 'Recommendation',
    price: 'Price',
    comparison: 'Comparison',
    info: 'Information',
  },
}

export default function AIQuestionsModal({
  open,
  onClose,
  questions,
  selectedProject,
  projects,
  language,
  isRTL,
  onAddQuestions,
  loading = false,
  successMessage,
}: AIQuestionsModalProps) {
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set())
  const [editedQuestions, setEditedQuestions] = useState<Map<string, string>>(new Map())

  const t = {
    he: {
      title: 'שאלות AI שנוצרו',
      subtitle: 'בדקו, ערכו, ובחרו אילו שאלות להוסיף',
      selectAll: 'בחירת הכל',
      deselectAll: 'ביטול בחירה',
      addButton: 'הוספת שאלות לפרויקט',
      selectProject: 'בחירת פרויקט',
      projectPlaceholder: 'בחרו פרויקט...',
      cancel: 'ביטול',
      sourceKeyword: 'ביטוי מקור',
      error: 'יש לבחור פרויקט תחילה',
      success: 'השאלות נוספו בהצלחה',
      added: (count: number) => `נוספו ${count} שאלות`,
      skipped: (count: number) => `${count} שאלות כבר היו קיימות`,
    },
    en: {
      title: 'Generated AI Questions',
      subtitle: 'Review, edit, and select which questions to add',
      selectAll: 'Select all',
      deselectAll: 'Deselect all',
      addButton: 'Add questions to project',
      selectProject: 'Select project',
      projectPlaceholder: 'Select a project...',
      cancel: 'Cancel',
      sourceKeyword: 'Source keyword',
      error: 'Please select a project first',
      success: 'Questions added successfully!',
      added: (count: number) => `${count} questions added`,
      skipped: (count: number) => `${count} questions already existed`,
    },
  }

  const labels = t[language]
  const typeLabelsForLang = typeLabels[language]

  const toggleQuestion = (id: string) => {
    const newSelected = new Set(selectedQuestions)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedQuestions(newSelected)
  }

  const updateQuestion = (id: string, newText: string) => {
    const newEdited = new Map(editedQuestions)
    newEdited.set(id, newText)
    setEditedQuestions(newEdited)
  }

  const selectAll = () => {
    setSelectedQuestions(new Set(questions.map((_, i) => String(i))))
  }

  const deselectAll = () => {
    setSelectedQuestions(new Set())
  }

  const getDisplayQuestion = (index: number, original: GeneratedQuestion) => {
    return editedQuestions.has(String(index)) ? editedQuestions.get(String(index))! : original.question
  }

  const handleAdd = async () => {
    if (!selectedProject) {
      alert(labels.error)
      return
    }

    const toAdd = questions.filter((_, i) => selectedQuestions.has(String(i)))
    await onAddQuestions(toAdd)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-slate-900 rounded-lg shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto ${isRTL ? 'rtl' : 'ltr'}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-900">
          <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{labels.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">{labels.subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Project Selection */}
          <div>
            <label className={`block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
              {labels.selectProject} *
            </label>
            <select
              value={selectedProject}
              disabled
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              <option value={selectedProject}>{projects.find((p) => p.id === selectedProject)?.name || labels.projectPlaceholder}</option>
            </select>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
              <CheckCircle size={18} />
              <span className="text-sm">{successMessage}</span>
            </div>
          )}

          {/* Toolbar */}
          <div className={`flex gap-2 justify-between items-center mb-4`}>
            <div className={`text-sm text-slate-600 dark:text-slate-400`}>
              {selectedQuestions.size} / {questions.length} selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {labels.selectAll}
              </button>
              <button
                onClick={deselectAll}
                className="text-xs px-3 py-1 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {labels.deselectAll}
              </button>
            </div>
          </div>

          {/* Questions List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {questions.map((question, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 space-y-2 ${
                  selectedQuestions.has(String(idx)) ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedQuestions.has(String(idx))}
                    onChange={() => toggleQuestion(String(idx))}
                    className="mt-1 rounded"
                  />
                  <div className="flex-1">
                    <textarea
                      value={getDisplayQuestion(idx, question)}
                      onChange={(e) => updateQuestion(String(idx), e.target.value)}
                      className="w-full px-3 py-2 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>
                </div>
                <div className={`flex gap-2 text-xs ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="px-2 py-1 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {typeLabelsForLang[question.type]}
                  </span>
                  <span className="px-2 py-1 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                    {labels.sourceKeyword}: {question.sourceKeyword}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-3 p-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            {labels.cancel}
          </button>
          <button
            onClick={handleAdd}
            disabled={!selectedProject || loading || selectedQuestions.size === 0}
            className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-semibold transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {labels.addButton}
          </button>
        </div>
      </div>
    </div>
  )
}
