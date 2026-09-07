-- Episteme 知屿: storage hardening + course video storage
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['application/pdf','text/plain','text/markdown','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','image/jpeg','image/png','image/webp']
where id='episteme-resources';

update storage.buckets
set public = false,
    file_size_limit = 1073741824,
    allowed_mime_types = array['video/mp4','video/webm','video/quicktime','video/x-m4v']
where id='episteme-courses';

drop policy if exists "authenticated upload episteme resources" on storage.objects;
drop policy if exists "episteme_resource_storage_insert" on storage.objects;
drop policy if exists "episteme_resource_storage_select" on storage.objects;
drop policy if exists "manager delete episteme resources" on storage.objects;
drop policy if exists "owner delete episteme resources" on storage.objects;
drop policy if exists "public read episteme resources" on storage.objects;

create policy "episteme_resources_public_read"
on storage.objects for select to public
using (bucket_id='episteme-resources');

create policy "episteme_resources_owner_upload"
on storage.objects for insert to authenticated
with check (bucket_id='episteme-resources' and (storage.foldername(name))[1]=(select auth.uid()::text));

create policy "episteme_resources_owner_or_coordinator_update"
on storage.objects for update to authenticated
using (bucket_id='episteme-resources' and ((owner_id=(select auth.uid()::text)) or is_coordinator()))
with check (bucket_id='episteme-resources');

create policy "episteme_resources_owner_or_coordinator_delete"
on storage.objects for delete to authenticated
using (bucket_id='episteme-resources' and ((owner_id=(select auth.uid()::text)) or is_coordinator()));

drop policy if exists "episteme_course_storage_select" on storage.objects;
drop policy if exists "episteme_course_storage_insert" on storage.objects;
drop policy if exists "episteme_course_storage_update" on storage.objects;
drop policy if exists "episteme_course_storage_delete" on storage.objects;

create policy "episteme_course_storage_select"
on storage.objects for select to authenticated
using (
  bucket_id='episteme-courses' and exists (
    select 1 from public.course_lessons l
    join public.courses c on c.id=l.course_id
    where l.storage_path=name
      and (c.status='published' or is_coordinator() or manages_subject(c.subject_id))
  )
);

create policy "episteme_course_storage_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='episteme-courses' and exists (
    select 1 from public.courses c
    where c.id::text=(storage.foldername(name))[1]
      and (is_coordinator() or manages_subject(c.subject_id))
  )
);

create policy "episteme_course_storage_update"
on storage.objects for update to authenticated
using (
  bucket_id='episteme-courses' and exists (
    select 1 from public.course_lessons l
    join public.courses c on c.id=l.course_id
    where l.storage_path=name
      and (is_coordinator() or manages_subject(c.subject_id))
  )
)
with check (bucket_id='episteme-courses');

create policy "episteme_course_storage_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='episteme-courses' and (
    is_coordinator() or exists (
      select 1 from public.course_lessons l
      join public.courses c on c.id=l.course_id
      where l.storage_path=name and manages_subject(c.subject_id)
    )
  )
);