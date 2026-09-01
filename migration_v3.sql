-- Episteme 知屿 V3 migration
-- Run once in Supabase SQL Editor after the original schema.sql.

-- 1) Give each course one of the three learning sections.
alter table public.courses
  add column if not exists course_type text not null default 'textbook'
  check (course_type in ('textbook','ig','advanced'));

-- 2) Allow every authenticated member to upload resources.
--    Resources remain pending until a subject manager/admin approves them.
drop policy if exists "authenticated upload resources" on public.resources;
create policy "authenticated upload resources"
on public.resources for insert to authenticated
with check (uploader_id = auth.uid());

-- 3) Managers/admins can delete resource records.
drop policy if exists "manager delete resources" on public.resources;
create policy "manager delete resources"
on public.resources for delete to authenticated
using (public.my_role() in ('subject_manager','admin'));

-- 4) Fix Storage delete comparison for Supabase projects where owner_id is text.
drop policy if exists "owner delete episteme resources" on storage.objects;
create policy "owner delete episteme resources"
on storage.objects for delete to authenticated
using (
  bucket_id = 'episteme-resources'
  and owner_id = auth.uid()::text
);

-- 5) Managers can manage uploaded files in the bucket.
drop policy if exists "manager delete episteme resources" on storage.objects;
create policy "manager delete episteme resources"
on storage.objects for delete to authenticated
using (
  bucket_id = 'episteme-resources'
  and public.my_role() in ('subject_manager','admin')
);

-- Optional examples for classifying existing courses:
-- update public.courses set course_type='textbook' where ...;
-- update public.courses set course_type='ig' where ...;
-- update public.courses set course_type='advanced' where ...;
