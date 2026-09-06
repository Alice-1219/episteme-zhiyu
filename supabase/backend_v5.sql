-- Episteme 知屿 backend V5
-- 目标：资料 Storage + Coordinator / Subject Manager 权限
-- 在 Supabase SQL Editor 执行一次。

-- 1) 补齐现有 resources 表（兼容之前已经存在的表）
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2) 课程分类：课本 / IG / 进阶
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS course_type text DEFAULT 'textbook';
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_course_type_check;
ALTER TABLE public.courses ADD CONSTRAINT courses_course_type_check
CHECK (course_type IN ('textbook','ig','advanced'));

-- 3) Subject Manager 映射表（兼容 V4.2）
CREATE TABLE IF NOT EXISTS public.subject_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id bigint NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, subject_id)
);

-- 4) 安全函数：最高权限 coordinator；subject manager 只能管理自己负责的学科
CREATE OR REPLACE FUNCTION public.is_coordinator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='coordinator') $$;

CREATE OR REPLACE FUNCTION public.is_subject_manager(p_subject_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.subject_managers WHERE user_id=auth.uid() AND subject_id=p_subject_id) $$;

-- 5) RLS
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_managers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resources_public_read_approved" ON public.resources;
CREATE POLICY "resources_public_read_approved" ON public.resources FOR SELECT
USING (status='approved' OR uploader_id=auth.uid() OR public.is_coordinator() OR public.is_subject_manager(subject_id));

DROP POLICY IF EXISTS "resources_member_insert" ON public.resources;
CREATE POLICY "resources_member_insert" ON public.resources FOR INSERT TO authenticated
WITH CHECK (uploader_id=auth.uid() AND status='pending');

DROP POLICY IF EXISTS "resources_manager_update" ON public.resources;
CREATE POLICY "resources_manager_update" ON public.resources FOR UPDATE TO authenticated
USING (public.is_coordinator() OR public.is_subject_manager(subject_id) OR uploader_id=auth.uid())
WITH CHECK (public.is_coordinator() OR public.is_subject_manager(subject_id) OR uploader_id=auth.uid());

DROP POLICY IF EXISTS "resources_manager_delete" ON public.resources;
CREATE POLICY "resources_manager_delete" ON public.resources FOR DELETE TO authenticated
USING (public.is_coordinator() OR public.is_subject_manager(subject_id) OR uploader_id=auth.uid());

DROP POLICY IF EXISTS "subject_managers_read" ON public.subject_managers;
CREATE POLICY "subject_managers_read" ON public.subject_managers FOR SELECT TO authenticated
USING (user_id=auth.uid() OR public.is_coordinator());

DROP POLICY IF EXISTS "subject_managers_coordinator_insert" ON public.subject_managers;
CREATE POLICY "subject_managers_coordinator_insert" ON public.subject_managers FOR INSERT TO authenticated
WITH CHECK (public.is_coordinator());

DROP POLICY IF EXISTS "subject_managers_coordinator_delete" ON public.subject_managers;
CREATE POLICY "subject_managers_coordinator_delete" ON public.subject_managers FOR DELETE TO authenticated
USING (public.is_coordinator());

-- 6) Storage bucket
INSERT INTO storage.buckets (id,name,public)
VALUES ('episteme-resources','episteme-resources',false)
ON CONFLICT (id) DO NOTHING;

-- Storage：用户只能上传到自己的 user-id/ 文件夹；负责人 / coordinator 可读和删除
DROP POLICY IF EXISTS "resource_storage_insert" ON storage.objects;
CREATE POLICY "resource_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='episteme-resources' AND (storage.foldername(name))[1]=auth.uid()::text);

DROP POLICY IF EXISTS "resource_storage_select" ON storage.objects;
CREATE POLICY "resource_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='episteme-resources' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.is_coordinator()));

DROP POLICY IF EXISTS "resource_storage_delete" ON storage.objects;
CREATE POLICY "resource_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='episteme-resources' AND ((storage.foldername(name))[1]=auth.uid()::text OR public.is_coordinator()));

-- 7) 审核时自动记录审核人 / 时间
CREATE OR REPLACE FUNCTION public.set_resource_review_metadata()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
    NEW.approved_by := auth.uid();
    NEW.approved_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_resource_review_metadata ON public.resources;
CREATE TRIGGER trg_resource_review_metadata BEFORE UPDATE ON public.resources
FOR EACH ROW EXECUTE FUNCTION public.set_resource_review_metadata();

-- 8) courses：subject manager / coordinator 可管理
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "courses_manager_insert" ON public.courses;
CREATE POLICY "courses_manager_insert" ON public.courses FOR INSERT TO authenticated
WITH CHECK (public.is_coordinator() OR public.is_subject_manager(subject_id));
DROP POLICY IF EXISTS "courses_manager_update" ON public.courses;
CREATE POLICY "courses_manager_update" ON public.courses FOR UPDATE TO authenticated
USING (public.is_coordinator() OR public.is_subject_manager(subject_id) OR teacher_id=auth.uid())
WITH CHECK (public.is_coordinator() OR public.is_subject_manager(subject_id) OR teacher_id=auth.uid());
DROP POLICY IF EXISTS "courses_manager_delete" ON public.courses;
CREATE POLICY "courses_manager_delete" ON public.courses FOR DELETE TO authenticated
USING (public.is_coordinator() OR public.is_subject_manager(subject_id) OR teacher_id=auth.uid());

-- 完成后：Coordinator 访问 /admin.html；Subject Manager 同样访问 /admin.html，系统会自动显示不同后台。
