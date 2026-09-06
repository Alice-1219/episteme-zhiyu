-- Episteme 知屿 V8: enforce subject-scoped manager policies
DROP POLICY IF EXISTS "managers manage lessons" ON public.course_lessons;
DROP POLICY IF EXISTS "managers create courses" ON public.courses;
DROP POLICY IF EXISTS "managers update courses" ON public.courses;
DROP POLICY IF EXISTS "manager delete resources" ON public.resources;
DROP POLICY IF EXISTS "uploader or manager update resources" ON public.resources;
DROP POLICY IF EXISTS "resources_read" ON public.resources;
DROP POLICY IF EXISTS "approved resources public read" ON public.resources;
DROP POLICY IF EXISTS "resources_owner_update" ON public.resources;
DROP POLICY IF EXISTS "resources_member_insert" ON public.resources;
DROP POLICY IF EXISTS "resources_coordinator_delete" ON public.resources;
DROP POLICY IF EXISTS "courses public read" ON public.courses;
DROP POLICY IF EXISTS "lessons public read" ON public.course_lessons;
CREATE POLICY "courses public published read" ON public.courses FOR SELECT TO anon USING (status = 'published');
CREATE POLICY "lessons public published read" ON public.course_lessons FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_lessons.course_id AND c.status = 'published'));
DROP POLICY IF EXISTS resources_public_approved_select ON public.resources;
DROP POLICY IF EXISTS resources_owner_select ON public.resources;
CREATE POLICY resources_public_approved_select ON public.resources FOR SELECT TO anon USING (status = 'approved');
CREATE POLICY resources_owner_or_manager_select ON public.resources FOR SELECT TO authenticated USING (
  uploader_id = (SELECT auth.uid()) OR status = 'approved' OR
  (SELECT public.is_coordinator()) OR
  (subject_id IS NOT NULL AND public.manages_subject(subject_id))
);