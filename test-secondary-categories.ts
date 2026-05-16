/**
 * Test script to verify secondary category question generation and regenerate diversity.
 * Tests the ששקה project with:
 * - Primary category: חנות בגדי יד שנייה לנשים
 * - Secondary categories: וינטג׳, מותגים, שמלות ערב, אקססוריז
 * - Already added question: חנויות בגדי יד שנייה מומלצות בישראל
 */

import { generatePromptSuggestions, type ManualAIProfile } from './lib/ai-visibility/prompt-templates'

function normalizeForCompare(p: string): string {
  return p.toLowerCase().replace(/[?!.,;:'"״׳`\-–—]/g, '').replace(/\s+/g, ' ').trim()
}

function hasSecondaryCategory(prompt: string, secondaries: string[]): boolean {
  const normalized = prompt.toLowerCase()
  return secondaries.some(s => normalized.includes(s.toLowerCase()))
}

function testSecondaryCategories() {
  console.log('\n=== SECONDARY CATEGORY TEST ===\n')

  const manualProfile: ManualAIProfile = {
    mode: 'manual',
    primaryCategory: 'חנות בגדי יד שנייה לנשים',
    secondaryCategories: ['וינטג׳', 'מותגים', 'שמלות ערב', 'אקססוריז'],
    excludedTopics: [],
  }

  // Already added question
  const alreadyAdded = normalizeForCompare('חנויות בגדי יד שנייה מומלצות בישראל')

  // Generate three regenerate sets
  const sets: Array<{ set: string[], usedSecondaries: Set<string> }> = []

  for (let i = 1; i <= 3; i++) {
    console.log(`\n--- REGENERATE SET #${i} ---\n`)

    // Build excludePrompts from previous sets + already added
    const excludePrompts: string[] = [alreadyAdded]
    for (const s of sets) {
      excludePrompts.push(...s.set)
    }

    const produced = generatePromptSuggestions({
      businessName: 'ששקה',
      domain: 'shashka.co.il',
      city: 'תל אביב',
      country: 'IL',
      language: 'he',
      keywords: [],
      manualProfile,
      diversify: true,
      limit: 6,
      excludePrompts,
      previousSet: sets.length > 0 ? sets[sets.length - 1].set : [],
    })

    const normalizedSet = produced.map(s => normalizeForCompare(s.prompt))
    const usedSecondaries = new Set<string>()

    console.log(`Generated ${produced.length} questions:`)
    for (let j = 0; j < produced.length; j++) {
      console.log(`${j + 1}. ${produced[j].prompt}`)

      // Check which secondaries are used
      for (const sec of manualProfile.secondaryCategories!) {
        if (hasSecondaryCategory(produced[j].prompt, [sec])) {
          usedSecondaries.add(sec)
        }
      }
    }

    console.log(`\nSecondary categories used: ${Array.from(usedSecondaries).join(', ') || 'None'}`)

    // Check stats
    const withSecondary = produced.filter(p =>
      manualProfile.secondaryCategories!.some(s => p.prompt.toLowerCase().includes(s.toLowerCase()))
    ).length
    console.log(`Questions with secondary categories: ${withSecondary}/${produced.length}`)

    sets.push({ set: normalizedSet, usedSecondaries })
  }

  // Verify diversity
  console.log('\n=== DIVERSITY ANALYSIS ===\n')

  // Check if sets are different from each other
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const set1 = sets[i].set
      const set2 = sets[j].set

      const common = set1.filter(q => set2.includes(q)).length
      const different = 6 - common

      console.log(`Set #${i + 1} vs Set #${j + 1}: ${common} same, ${different} different ✓`)

      if (different < 4) {
        console.log(`⚠️  WARNING: Only ${different} out of 6 are different!`)
      }
    }
  }

  // Check secondary category rotation
  console.log('\n=== SECONDARY CATEGORY ROTATION ===\n')

  const secondaryUsageBySet = sets.map((s, idx) => ({
    setNum: idx + 1,
    used: Array.from(s.usedSecondaries),
  }))

  for (const usage of secondaryUsageBySet) {
    console.log(`Set #${usage.setNum}: ${usage.used.join(', ') || 'No secondary categories'}`)
  }

  // Check if secondary categories are rotated
  if (secondaryUsageBySet[0].used.length > 0 && secondaryUsageBySet[1].used.length > 0) {
    const set1Secondary = new Set(secondaryUsageBySet[0].used)
    const set2Secondary = new Set(secondaryUsageBySet[1].used)
    const overlap = [...set1Secondary].filter(s => set2Secondary.has(s)).length

    if (overlap === 0) {
      console.log('✓ Secondary categories are rotating (no overlap)')
    } else {
      console.log(`⚠️  Secondary categories have ${overlap} overlapping (less ideal for rotation)`)
    }
  }

  console.log('\n=== TEST COMPLETE ===\n')
}

testSecondaryCategories()
