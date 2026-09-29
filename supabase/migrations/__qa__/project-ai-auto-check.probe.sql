-- ============================================================================
-- EXECUTED PROBE — 20260930000000_project_ai_auto_check.sql
--
-- Applies the migration file itself (via \i, twice, for idempotency) to a
-- disposable PostgreSQL cluster with an existing projects table and rows, then:
--
--   'after'     the column exists, existing rows read ON, a new row reads ON,
--               NULL is refused, OFF is stored, nothing else about a row changes.
--   'mutated'   MUTATION CONTROL. The default is flipped to false by hand: the
--               "a new project reads ON" check must now report it.
--   'restored'  the migration applied again: a new project reads ON again, and
--               the value a project already chose is kept.
--
-- NOT run against Supabase or Production; every row below is fabricated here.
-- Run:  bash scripts/qa/pg-probe.sh supabase/migrations/__qa__/project-ai-auto-check.probe.sql
-- ============================================================================
\set QUIET on
CREATE TABLE public.projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text, is_active boolean NOT NULL DEFAULT true);
INSERT INTO public.projects (id, user_id, name) VALUES
  ('a1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'existing one'),
  ('a2222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'existing two');

CREATE TABLE results (phase text, name text, ok boolean);
CREATE FUNCTION chk(ph text, n text, c boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN INSERT INTO results VALUES (ph, n, COALESCE(c, false)); END; $$;

CREATE FUNCTION new_row_default() RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean;
BEGIN
  INSERT INTO public.projects (user_id, name) VALUES ('33333333-3333-3333-3333-333333333333', 'probe-new') RETURNING ai_auto_check_enabled INTO v;
  DELETE FROM public.projects WHERE name = 'probe-new';
  RETURN v;
END $$;

\i supabase/migrations/20260930000000_project_ai_auto_check.sql
\i supabase/migrations/20260930000000_project_ai_auto_check.sql

DO $$
DECLARE err text;
BEGIN
  PERFORM chk('after', 'the column exists, boolean, NOT NULL',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'ai_auto_check_enabled'
      AND data_type = 'boolean' AND is_nullable = 'NO'));
  PERFORM chk('after', 'existing projects read ON', (SELECT bool_and(ai_auto_check_enabled) FROM public.projects));
  PERFORM chk('after', 'a new project reads ON', new_row_default() IS TRUE);
  BEGIN
    UPDATE public.projects SET ai_auto_check_enabled = NULL WHERE id = 'a1111111-1111-1111-1111-111111111111';
  EXCEPTION WHEN not_null_violation THEN err := SQLSTATE;
  END;
  PERFORM chk('after', 'NULL is refused', err = '23502');
  UPDATE public.projects SET ai_auto_check_enabled = false WHERE id = 'a2222222-2222-2222-2222-222222222222';
  PERFORM chk('after', 'OFF is stored for that project only',
    (SELECT ai_auto_check_enabled FROM public.projects WHERE id = 'a2222222-2222-2222-2222-222222222222') IS FALSE
    AND (SELECT ai_auto_check_enabled FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111') IS TRUE);
  PERFORM chk('after', 'the rows are otherwise unchanged', (SELECT count(*) FROM public.projects) = 2
    AND (SELECT name FROM public.projects WHERE id = 'a1111111-1111-1111-1111-111111111111') = 'existing one');
END $$;

-- MUTATION: the default flipped by hand.
ALTER TABLE public.projects ALTER COLUMN ai_auto_check_enabled SET DEFAULT false;
DO $$ BEGIN
  PERFORM chk('mutated', 'MUT default false: the "a new project reads ON" check reports it', new_row_default() IS FALSE);
END $$;

\i supabase/migrations/20260930000000_project_ai_auto_check.sql
DO $$ BEGIN
  PERFORM chk('restored', 'a new project reads ON again', new_row_default() IS TRUE);
  PERFORM chk('restored', 'the project that chose OFF keeps OFF',
    (SELECT ai_auto_check_enabled FROM public.projects WHERE id = 'a2222222-2222-2222-2222-222222222222') IS FALSE);
END $$;

\set QUIET off
SELECT phase, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS status, name FROM results
  ORDER BY array_position(ARRAY['after','mutated','restored'], phase), name;
SELECT count(*) FILTER (WHERE ok) || ' passed, ' || count(*) FILTER (WHERE NOT ok) || ' failed' AS summary FROM results;
