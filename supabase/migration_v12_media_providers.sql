begin;

alter table public.course_lessons add column if not exists video_provider text not null default 'supabase';
alter table public.course_lessons add column if not exists video_ref text;
alter table public.course_lessons add column if not exists video_url text;

update public.course_lessons set video_provider='supabase' where video_provider is null or trim(video_provider)='';

drop constraint if exists course_lessons_video_provider_check;
alter table public.course_lessons add constraint course_lessons_video_provider_check check (video_provider in ('supabase','bilibili','external'));
create index if not exists course_lessons_video_provider_idx on public.course_lessons(video_provider);

commit;