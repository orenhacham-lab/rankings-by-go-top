/**
 * /content/existing — what is already on the merchant's site: its pages, articles,
 * products and collections, with Search Console's figures and the cannibalization
 * risk per page. Read-only (lib/content/existing-content).
 *
 * The flag gate, the workspace provider and the shell live in the layout.
 */

import ExistingContentScreen from '@/components/content/workspace/ExistingContentScreen'

export default function ContentExistingPage() {
  return <ExistingContentScreen />
}
