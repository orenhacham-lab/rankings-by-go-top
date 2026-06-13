-- Add brand & domain aliases to projects for AI Visibility signal classification.
--
-- These let the AI-result analyzer recognise additional ways a business / site
-- can appear in an AI answer or its sources, e.g. for a "Samsung" project:
--   brand_aliases  = {'Samsung','Samsung Israel','סמסונג ישראל','Samsung Mobile','סמסונג מובייל'}
--   domain_aliases = {'samsungmobile.co.il','www.samsungmobile.co.il'}
--
-- Both default to an empty array so existing rows and inserts are unaffected.
-- Detection/normalization is handled in application code
-- (lib/ai-visibility/matching/signal-classifier.ts); these columns are storage only.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS brand_aliases  text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS domain_aliases text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.projects.brand_aliases  IS 'Extra brand names/aliases (Hebrew + English) to detect as a brand mention in AI answers.';
COMMENT ON COLUMN public.projects.domain_aliases IS 'Extra domains to treat as the project domain when detecting mentions and source citations.';
