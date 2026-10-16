-- outreach_prospects.postal_address_page — the page the postal address was read from
--
-- WHY A SECOND SOURCE COLUMN. `source_site` already names a page of the
-- business's own site, but it names the one the CONTACT ADDRESS was taken from.
-- The two defend different promises, which is why one column cannot carry both:
--
--   source_site         answers "where did you get this email address", which is
--                       the address-harvesting question.
--   postal_address_page answers "where did you get the statement that this
--                       business operates in the United States", which is the
--                       promise that keeps this list outside the GDPR, and the
--                       promise that a business publishing no postal address
--                       never enters the list.
--
-- The published privacy text says the state resolves from the company's own
-- site, so the public directory that named the business cannot answer the second
-- question, and a reconstruction after the fact is not an answer either. Until
-- now the rows were verified but not self-evidencing: the qualifier read the
-- address off a specific page and then did not write down which.
--
-- ADDITIVE AND NULLABLE, with no backfill. Rows written before this cannot say
-- which page it was, and inventing one would be worse than leaving it empty: an
-- empty column reads as "not recorded", a guessed URL reads as evidence. New
-- rows get it from lib/outreach/topup.ts. NOT NULL is deliberately not set for
-- the same reason — a constraint the existing rows cannot satisfy would make
-- this migration a data change rather than a schema change.
--
-- It survives redaction, like source_site: it is a URL of a public page of a
-- business, not a detail about a person, and it is the evidence that the row was
-- lawfully held in the first place — which is exactly the thing a redacted row
-- may still be asked about.

ALTER TABLE public.outreach_prospects
  ADD COLUMN IF NOT EXISTS postal_address_page text;

COMMENT ON COLUMN public.outreach_prospects.postal_address_page IS
  'The business''s own public page the postal address was read from. Evidence for the published promise that the United States address comes from the company''s own site, not from the directory that named it. Distinct from source_site, which names the page the email address came from.';
