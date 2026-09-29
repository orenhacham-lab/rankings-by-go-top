-- ============================================================================
-- LINK NETWORK ("רשת הקישורים"): an opt-in network among our customers'
-- projects. When we write an article for a member project, the engine may place
-- ONE contextual link to another member's relevant page (lib/link-network).
--
-- WHAT. Three new tables, nothing else:
--
--   link_network_members     one row per project that joined. OFF by default:
--                            a project is a member only after its owner turned
--                            the switch on and accepted the consent text. The
--                            row records who consented, when, to which consent
--                            version and under which link type. Leaving sets
--                            active = false and left_at; the row (the consent
--                            record) stays.
--   link_network_placements  the placement log: every link the engine wrote
--                            (source project + article, target project + url,
--                            anchor, link type, time). Only the giving side reads
--                            its rows directly; the receiving side sees its
--                            links through the owner route (service role),
--                            which shows nothing of a draft. The giving side can reject a placement
--                            before the article is published (status
--                            'rejected', the link is taken out of the draft).
--   link_network_settings    ONE row: the network-wide link type, 'follow'
--                            (default, the owner's decision) or 'nofollow'.
--                            Switching it is one UPDATE, no code change; each
--                            placement stores the type it was written with, and
--                            each consent the type that was active when given.
--
-- HARD RULES THE DATABASE ENFORCES (the engine checks them first; these are the
-- floor that holds even under concurrent generation):
--   * never a project to itself, never between two projects of the same owner;
--   * never reciprocal: A -> B cannot be placed while B -> A is placed. A
--     trigger takes a transaction lock on the unordered pair before it checks,
--     so two articles generated at the same moment cannot both win;
--   * at most one placed link per source article;
--   * the target url is http(s) and the anchor is short text.
--
-- ACCESS. Rows are written ONLY by service-role server code (the generation step
-- and the owner routes after they verified the signed-in user owns the project).
-- The owner reads their own membership; a placement is read directly only by
-- the owner of the GIVING side, and only its non-identifying columns (no account
-- id of either side). The receiving side never reads the row through PostgREST:
-- it would learn the giver's account and article ids and which site is linking
-- to it from a draft that may never be published. An admin who owns neither
-- side reads nothing; anon nothing.
-- Grants follow 20260928000000_project_monthly_reports.sql: Supabase's default
-- table grants are revoked and only what is needed is granted back.
--
-- Additive: three new tables, one trigger function, no change to an existing
-- table. Idempotent: every statement can be re-run.
-- Rollback: DROP TABLE public.link_network_placements; DROP TABLE public.link_network_members;
--           DROP TABLE public.link_network_settings; DROP FUNCTION public.link_network_placement_guard();
-- Executed probe: supabase/migrations/__qa__/link-network.probe.sql
-- ============================================================================

BEGIN;

-- ── 1. members ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_network_members (
  project_id        uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  -- The project owner. Written by the server from the project row, never from a request.
  user_id           uuid NOT NULL,
  active            boolean NOT NULL DEFAULT false,
  -- The consent the owner accepted (lib/link-network/consent.ts LINK_NETWORK_CONSENT_VERSION),
  -- by whom, when, and the link type the network used at that moment.
  consent_version   text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 40),
  consented_by      uuid NOT NULL,
  consented_at      timestamptz NOT NULL DEFAULT now(),
  consent_link_rel  text NOT NULL CHECK (consent_link_rel IN ('nofollow', 'follow')),
  left_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.link_network_members IS
  'Link network membership, one row per project. active=false by default; set true only by the owner route after explicit consent. Written only by service-role server code; the owner reads it under RLS.';

-- The network size ("members") and the engine's candidate read.
CREATE INDEX IF NOT EXISTS idx_link_network_members_active
  ON public.link_network_members (project_id) WHERE active;

ALTER TABLE public.link_network_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.link_network_members FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.link_network_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.link_network_members TO service_role;

DROP POLICY IF EXISTS link_network_members_owner_select ON public.link_network_members;
CREATE POLICY link_network_members_owner_select ON public.link_network_members
  FOR SELECT TO authenticated
  USING (project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- ── 2. placements ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_network_placements (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The giving side: the member whose article carries the link.
  source_project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_user_id     uuid NOT NULL,
  -- NULL once the article itself was deleted: the log line stays.
  source_article_id  uuid REFERENCES public.generated_articles(id) ON DELETE SET NULL,
  source_domain      text NOT NULL CHECK (char_length(source_domain) BETWEEN 3 AND 253),
  -- The receiving side.
  target_project_id  uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_user_id     uuid NOT NULL,
  target_url         text NOT NULL CHECK (target_url ~* '^https?://' AND char_length(target_url) <= 2048),
  anchor_text        text NOT NULL CHECK (char_length(anchor_text) BETWEEN 2 AND 120),
  -- The link type the link was written with (the network setting at that moment).
  link_rel           text NOT NULL CHECK (link_rel IN ('nofollow', 'follow')),
  -- What kind of anchor it is (lib/link-network/anchor.ts): the engine keeps
  -- exact-match anchors rare per target, so the kind is logged with the link.
  anchor_kind        text NOT NULL CHECK (anchor_kind IN ('branded', 'partial', 'natural', 'exact')),
  -- How relevant the model judged the paragraph and the page (0-100); nothing
  -- is placed under the engine's threshold.
  relevance          smallint NOT NULL CHECK (relevance BETWEEN 0 AND 100),
  status             text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'rejected')),
  placed_at          timestamptz NOT NULL DEFAULT now(),
  rejected_at        timestamptz,
  rejected_by        uuid,

  CONSTRAINT link_network_placements_not_self CHECK (source_project_id <> target_project_id),
  CONSTRAINT link_network_placements_not_same_owner CHECK (source_user_id <> target_user_id),
  CONSTRAINT link_network_placements_rejected_when CHECK ((status = 'rejected') = (rejected_at IS NOT NULL))
);

COMMENT ON TABLE public.link_network_placements IS
  'Link network placement log: one row per link the engine wrote into a member article. Never reciprocal (trigger), one per article, never between one owner''s projects. Written only by service-role server code; the giving side reads its own rows (non-identifying columns) under RLS, the receiving side only through the owner route.';

-- One placed link per source article.
CREATE UNIQUE INDEX IF NOT EXISTS uq_link_network_placements_article
  ON public.link_network_placements (source_article_id)
  WHERE status = 'placed' AND source_article_id IS NOT NULL;

-- "What did I give" / "what did I receive", newest first; the caps count by month.
CREATE INDEX IF NOT EXISTS idx_link_network_placements_source
  ON public.link_network_placements (source_project_id, placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_link_network_placements_target
  ON public.link_network_placements (target_project_id, placed_at DESC);

-- Never reciprocal. Runs for a new placed row and for any change that could
-- make one (status back to placed, a moved side). The advisory lock is taken on
-- the UNORDERED pair, so "A -> B" and "B -> A" inserted at the same moment
-- serialise here, and the second one sees the first (a VOLATILE function takes a
-- fresh snapshot for each query, after the lock wait).
CREATE OR REPLACE FUNCTION public.link_network_placement_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'placed' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'link_network_pair:' || least(NEW.source_project_id::text, NEW.target_project_id::text)
        || ':' || greatest(NEW.source_project_id::text, NEW.target_project_id::text), 0));
    IF EXISTS (
      SELECT 1 FROM public.link_network_placements p
      WHERE p.source_project_id = NEW.target_project_id
        AND p.target_project_id = NEW.source_project_id
        AND p.status = 'placed'
        AND p.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'link_network_reciprocal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_network_placement_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS link_network_placements_guard ON public.link_network_placements;
CREATE TRIGGER link_network_placements_guard
  BEFORE INSERT OR UPDATE OF status, source_project_id, target_project_id ON public.link_network_placements
  FOR EACH ROW EXECUTE FUNCTION public.link_network_placement_guard();

ALTER TABLE public.link_network_placements ENABLE ROW LEVEL SECURITY;

-- REVOKE ALL also removes any column grant, so a re-run starts clean.
REVOKE ALL ON TABLE public.link_network_placements FROM PUBLIC, anon, authenticated, service_role;
-- Browser roles: the non-identifying columns only. No source_user_id,
-- target_user_id or rejected_by (account ids) for anyone.
GRANT SELECT (id, source_project_id, source_article_id, source_domain, target_project_id, target_url,
              anchor_text, link_rel, anchor_kind, relevance, status, placed_at, rejected_at)
  ON TABLE public.link_network_placements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.link_network_placements TO service_role;

-- The giving side only. The receiving side reads its links through
-- GET /api/projects/[id]/link-network (service role, owner-filtered), which
-- shows the giving site only once its article is live.
DROP POLICY IF EXISTS link_network_placements_sides_select ON public.link_network_placements;
DROP POLICY IF EXISTS link_network_placements_source_select ON public.link_network_placements;
CREATE POLICY link_network_placements_source_select ON public.link_network_placements
  FOR SELECT TO authenticated
  USING (source_project_id IN (SELECT p.id FROM public.projects p WHERE p.user_id = auth.uid()));

-- ── 3. the network-wide link type ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.link_network_settings (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  link_rel    text NOT NULL DEFAULT 'follow' CHECK (link_rel IN ('nofollow', 'follow')),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.link_network_settings IS
  'Link network settings, a single row. link_rel: follow (default) or nofollow, applied to new placements; switched with one UPDATE by the owner of the app.';

INSERT INTO public.link_network_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.link_network_settings ENABLE ROW LEVEL SECURITY;

-- Only the server reads it (and says the mode on the screen); nobody writes it
-- through the API: the owner of the app changes it in SQL.
REVOKE ALL ON TABLE public.link_network_settings FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.link_network_settings TO service_role;

COMMIT;
