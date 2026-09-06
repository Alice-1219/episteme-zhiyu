-- Episteme 知屿 V7: subject manager invite access
CREATE TABLE IF NOT EXISTS public.manager_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  subject_id bigint REFERENCES public.subjects(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.manager_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS manager_invites_coordinator_all ON public.manager_invites;
CREATE POLICY manager_invites_coordinator_all ON public.manager_invites FOR ALL TO authenticated USING ((SELECT public.is_coordinator())) WITH CHECK ((SELECT public.is_coordinator()));

CREATE OR REPLACE FUNCTION public.claim_subject_manager_invite(p_code text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_subject_id bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT subject_id INTO v_subject_id FROM public.manager_invites
  WHERE code = upper(trim(p_code)) AND active = true LIMIT 1;
  IF v_subject_id IS NULL THEN RAISE EXCEPTION 'Invalid or inactive invite code'; END IF;
  INSERT INTO public.subject_managers(user_id, subject_id)
  VALUES ((SELECT auth.uid()), v_subject_id) ON CONFLICT DO NOTHING;
  UPDATE public.profiles SET role = 'subject_manager'
  WHERE id = (SELECT auth.uid()) AND role = 'member';
  RETURN v_subject_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_subject_manager_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_subject_manager_invite(text) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_subject_managers_user_subject ON public.subject_managers(user_id, subject_id);