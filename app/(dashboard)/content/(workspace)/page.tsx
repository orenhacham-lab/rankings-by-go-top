/**
 * /content — the Articles screen.
 *
 * The flag gate, the workspace provider and the shell live in the layout; this route
 * is only the articles screen. It used to render ContentHub, a single component that
 * was also the topics, automation, Search Console and connections screens.
 */

import ArticlesScreen from '@/components/content/workspace/ArticlesScreen'

export default function ContentArticlesPage() {
  return <ArticlesScreen />
}
