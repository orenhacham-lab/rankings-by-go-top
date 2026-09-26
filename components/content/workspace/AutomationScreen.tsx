'use client'

/**
 * Automation & schedule — what the system proposes and what it will publish.
 *
 * The automatic article ideas (with the manual-topic alternative) and the publishing
 * queue. Both used to be "Section 2" of the one big content page, wedged between the
 * article table and the pending topics, which is why the automation ideas and the
 * queue they feed were easy to miss entirely.
 */

import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import AutomationIdeas from '@/components/content/AutomationIdeas'
import AutomationSchedule from '@/components/content/AutomationSchedule'
import { Plus } from 'lucide-react'
import { useContentWorkspace } from './ContentWorkspaceProvider'

export default function AutomationScreen({ proFirst = false }: { proFirst?: boolean }) {
  const {
    t, language, projectId, loadTopics,
    ideasSection, changeIdeasSection, scheduleSectionRef,
    automationRefresh, setAutomationRefresh, ideasSuccessSignal, linkPlanSavedHint, ctaScrollSignal,
    setNewTopics, setNewTopicsUnchecked, setNewTopicsSelected, setPlanStatus,
    handleScheduled, handleTopicsQueued, handleReviewLinks,
    setEditingTopic, setBriefOpen,
  } = useContentWorkspace()

  return (
    <div className="space-y-4">
      {/* M — the ideas destination: automatic ideas (default) + a manual
          topic sub-tab. The automatic workflow below is unchanged. */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
        {([['auto', t.ideasSubTabs.auto], ['manual', t.ideasSubTabs.manual]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => changeIdeasSection(key)}
            className={`text-sm px-3 py-2 -mb-px border-b-2 transition ${ideasSection === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-medium' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {ideasSection === 'manual' ? (
        <Card className="hover:translate-y-0">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.manualTopicTitle}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-3">{t.manualTopicHint}</p>
          {/* Reuses the SAME ArticleBriefModal → POST /api/content/topics (source='manual');
              all duplicate/title/ownership/quota checks apply; never auto-queued. */}
          <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}><Plus size={16} /> {t.newTopicButton}</Button>
        </Card>
      ) : (
        <>
          <AutomationIdeas
            proFirst={proFirst}
            projectId={projectId}
            language={language}
            onCreated={loadTopics}
            onScheduled={handleScheduled}
            onTopicsCreated={(created, unchecked, selected) => { if (created.length) { setNewTopicsUnchecked(unchecked ?? {}); setNewTopicsSelected(selected ?? {}); setNewTopics(created) } }}
            onPlansSaved={(plans) => setPlanStatus((prev) => ({ ...prev, ...Object.fromEntries(plans.map((p) => [p.topicId, { exists: p.exists, linkCount: p.linkCount, approvedCount: p.approvedCount, stale: p.stale }])) }))}
            onApproved={handleTopicsQueued}
            onReviewLinks={handleReviewLinks}
            planSavedHint={linkPlanSavedHint}
            scrollCtaSignal={ctaScrollSignal}
            queueSuccessSignal={ideasSuccessSignal}
            onGoToQueue={() => scheduleSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        </>
      )}

      {/* The publishing queue belongs to BOTH sub-tabs. It used to
          live inside the automatic branch, so a merchant working on
          the manual-topic tab could not see the queue their manual
          topics were being added to. It is rendered ONCE here,
          outside the auto/manual conditional and still inside
          automationEnabled — one component, one state, one
          scheduleSectionRef, so switching tabs neither duplicates it
          nor loses its refreshed state. */}
      <div ref={scheduleSectionRef} className="scroll-mt-4">
        <AutomationSchedule
          projectId={projectId}
          language={language}
          refreshKey={automationRefresh}
          onChanged={() => { loadTopics(); setAutomationRefresh((k) => k + 1) }}
        />
      </div>
    </div>
  )
}
