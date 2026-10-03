'use client'

/**
 * Automation & schedule — what the system proposes and what it will publish.
 *
 * The automatic article ideas (with the manual-topic alternative) and the publishing
 * queue. Both used to be "Section 2" of the one big content page, wedged between the
 * article table and the pending topics, which is why the automation ideas and the
 * queue they feed were easy to miss entirely.
 */

import Button from '@/components/ui/Button'
import AutomationIdeas from '@/components/content/AutomationIdeas'
import AutomationSchedule from '@/components/content/AutomationSchedule'
import { PenLine, Plus, Sparkles } from 'lucide-react'
import Segmented from '@/components/ui/Segmented'
import { useContentWorkspace } from './ContentWorkspaceProvider'

export default function AutomationScreen({ proFirst = false }: { proFirst?: boolean }) {
  const {
    t, language, projectId, loadTopics,
    ideasSection, changeIdeasSection, scheduleSectionRef,
    automationRefresh, setAutomationRefresh, ideasSuccessSignal, linkPlanSavedHint, ctaScrollSignal,
    setNewTopics, setNewTopicsUnchecked, setNewTopicsSelected, setPlanStatus,
    handleScheduled, handleTopicsQueued, handleReviewLinks,
    setEditingTopic, setBriefOpen, data,
  } = useContentWorkspace()

  return (
    <div className="space-y-5">
      {/* M — the ideas destination: automatic ideas (default) + a manual
          topic sub-tab. The automatic workflow below is unchanged. */}
      <Segmented<'auto' | 'manual'>
        ariaLabel={t.ideasSubTabs.label}
        value={ideasSection}
        onChange={changeIdeasSection}
        options={[
          { value: 'auto', label: t.ideasSubTabs.auto, icon: Sparkles },
          { value: 'manual', label: t.ideasSubTabs.manual, icon: PenLine },
        ]}
      />

      {ideasSection === 'manual' ? (
        <div className="motion-safe:animate-pop-in">
          <h3 className="text-section font-semibold text-ink">{t.manualTopicTitle}</h3>
          <p className="mb-4 mt-1 max-w-prose text-copy text-muted">{t.manualTopicHint}</p>
          {/* Reuses the SAME ArticleBriefModal → POST /api/content/topics (source='manual');
              all duplicate/title/ownership/quota checks apply; never auto-queued. */}
          <Button onClick={() => { setEditingTopic(null); setBriefOpen(true) }}><Plus className="size-4" aria-hidden="true" /> {t.newTopicButton}</Button>
        </div>
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
      {/* One card (the strategy's "advanced" panel), its sections split by a divider. */}
      <div className="mt-8 border-t border-line pt-8">
        <div ref={scheduleSectionRef} className="scroll-mt-4">
          <AutomationSchedule
            projectId={projectId}
            articles={data?.articles}
            language={language}
            refreshKey={automationRefresh}
            onChanged={() => { loadTopics(); setAutomationRefresh((k) => k + 1) }}
          />
        </div>
      </div>
    </div>
  )
}
