-- Episteme 知屿 V6: production-ready resource + course management
-- Run AFTER backend_v5.sql in Supabase SQL Editor.

-- ===== Resource metadata =====
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS mime_type text;

-- ===== Course metadata =====
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS course_type text NOT NULL DEFAULT 'textbook';
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.course_lessons ADD COLUMN IF NOT EXISTS storage_path text;

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_course_type_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_course_type_check
CHECK (course_type IN ('textbook','ig','advanced'));

ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_status_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_status_check
CHECK (status IN ('draft','published','archived'));

-- ===== Resource review audit fields =====
CREATE OR REPLACE FUNCTION public.review_resource_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
    NEW.rejection_reason := NULL;
  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  ELSIF NEW.status = 'pending' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_resource_fields ON public.resources;
CREATE TRIGGER trg_review_resource_fields
BEFORE UPDATE OF status ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.review_resource_fields();

-- ===== Safer RLS for resources =====
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resources_public_approved_select" ON public.resources;
DROP POLICY IF EXISTS "resources_authenticated_select" ON public.resources;
DROP POLICY IF EXISTS "resources_member_insert" ON public.resources;
DROP POLICY IF EXISTS "resources_manager_review" ON public.resources;
DROP POLICY IF EXISTS "resources_manager_delete" ON public.resources;

CREATE POLICY "resources_public_approved_select" ON public.resources
FOR SELECT TO anon, authenticated
USING (status = 'approved');

CREATE POLICY "resources_member_own_select" ON public.resources
FOR SELECT TO authenticated
USING (uploader_id = auth.uid());

CREATE POLICY "resources_member_insert" ON public.resources
FOR INSERT TO authenticated
WITH CHECK (uploader_id = auth.uid());

CREATE POLICY "resources_manager_review" ON public.resources
FOR UPDATE TO authenticated
USING (public.is_coordinator() OR public.manages_subject(subject_id))
WITH CHECK (public.is_coordinator() OR public.manages_subject(subject_id));

CREATE POLICY "resources_manager_delete" ON public.resources
FOR DELETE TO authenticated
USING (public.is_coordinator() OR public.manages_subject(subject_id) OR uploader_id = auth.uid());

-- ===== Courses =====
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_authenticated_select" ON public.courses;
DROP POLICY IF EXISTS "courses_manager_insert" ON public.courses;
DROP POLICY IF EXISTS "courses_manager_update" ON public.courses;
DROP POLICY IF EXISTS "courses_manager_delete" ON public.courses;

CREATE POLICY "courses_authenticated_select" ON public.courses
FOR SELECT TO authenticated
USING (status = 'published' OR public.is_coordinator() OR public.manages_subject(subject_id));

CREATE POLICY "courses_manager_insert" ON public.courses
FOR INSERT TO authenticated
WITH CHECK (public.is_coordinator() OR public.manages_subject(subject_id));

CREATE POLICY "courses_manager_update" ON public.courses
FOR UPDATE TO authenticated
USING (public.is_coordinator() OR public.manages_subject(subject_id))
WITH CHECK (public.is_coordinator() OR public.manages_subject(subject_id));

CREATE POLICY "courses_manager_delete" ON public.courses
FOR DELETE TO authenticated
USING (public.is_coordinator() OR public.manages_subject(subject_id));

-- ===== Course lessons =====
ALTER TABLE public.course_lessons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "course_lessons_authenticated_select" ON public.course_lessons;
DROP POLICY IF EXISTS "course_lessons_manager_insert" ON public.course_lessons;
DROP POLICY IF EXISTS "course_lessons_manager_update" ON public.course_lessons;
DROP POLICY IF EXISTS "course_lessons_manager_delete" ON public.course_lessons;

CREATE POLICY "course_lessons_authenticated_select" ON public.course_lessons
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.courses c
  WHERE c.id = course_lessons.course_id
    AND (c.status = 'published' OR public.is_coordinator() OR public.manages_subject(c.subject_id))
));

CREATE POLICY "course_lessons_manager_insert" ON public.course_lessons
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.courses c
  WHERE c.id = course_lessons.course_id
    AND (public.is_coordinator() OR public.manages_subject(c.subject_id))
));

CREATE POLICY "course_lessons_manager_update" ON public.course_lessons
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.courses c
  WHERE c.id = course_lessons.course_id
    AND (public.is_coordinator() OR public.manages_subject(c.subject_id))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.courses c
  WHERE c.id = course_lessons.course_id
    AND (public.is_coordinator() OR public.manages_subject(c.subject_id))
));

CREATE POLICY "course_lessons_manager_delete" ON public.course_lessons
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.courses c
  WHERE c.id = course_lessons.course_id
    AND (public.is_coordinator() OR public.manages_subject(c.subject_id))
));

-- ===== Storage for course videos =====
INSERT INTO storage.buckets (id, name, public)
VALUES ('episteme-courses', 'episteme-courses', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "course_storage_authenticated_upload" ON storage.objects;
DROP POLICY IF EXISTS "course_storage_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "course_storage_owner_delete" ON storage.objects;

CREATE POLICY "course_storage_authenticated_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'episteme-courses'
  AND (public.is_coordinator() OR EXISTS (
    SELECT 1 FROM public.subject_managers sm
    WHERE sm.user_id = auth.uid()
  ))
);

CREATE POLICY "course_storage_authenticated_read" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'episteme-courses');

CREATE POLICY "course_storage_owner_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'episteme-courses'
  AND (owner_id = auth.uid()::text OR public.is_coordinator())
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS resources_status_idx ON public.resources(status);
CREATE INDEX IF NOT EXISTS resources_subject_idx ON public.resources(subject_id);
CREATE INDEX IF NOT EXISTS courses_subject_idx ON public.courses(subject_id);
CREATE INDEX IF NOT EXISTS courses_type_idx ON public.courses(course_type);
