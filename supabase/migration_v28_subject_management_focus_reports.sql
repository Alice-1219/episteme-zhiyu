begin;

-- Subject-manager visibility/removal is scoped to subjects the current manager manages.
drop policy if exists "subject_managers_self_read" on public.subject_managers;
drop policy if exists "subject_managers_manager_read" on public.subject_managers;
create policy "subject_managers_manager_read" on public.subject_managers for select to authenticated
using (public.is_coordinator() or public.manages_subject(subject_id));
drop policy if exists "subject_managers_coordinator_all" on public.subject_managers;
create policy "subject_managers_coordinator_all" on public.subject_managers for all to authenticated
using (public.is_coordinator()) with check (public.is_coordinator());
drop policy if exists "subject_managers_manager_delete" on public.subject_managers;
create policy "subject_managers_manager_delete" on public.subject_managers for delete to authenticated
using (public.is_coordinator() or public.manages_subject(subject_id));

-- Primary/focus subjects. Any assigned subject not selected here is auxiliary.
create table if not exists public.subject_focus (
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  focus text not null default 'primary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, subject_id),
  constraint subject_focus_focus_check check (focus in ('primary','auxiliary'))
);
alter table public.subject_focus enable row level security;
drop policy if exists "subject_focus_self_read" on public.subject_focus;
create policy "subject_focus_self_read" on public.subject_focus for select to authenticated
using (user_id=auth.uid() or public.is_coordinator());
drop policy if exists "subject_focus_self_insert" on public.subject_focus;
create policy "subject_focus_self_insert" on public.subject_focus for insert to authenticated
with check (user_id=auth.uid() and (public.is_coordinator() or public.manages_subject(subject_id)));
drop policy if exists "subject_focus_self_update" on public.subject_focus;
create policy "subject_focus_self_update" on public.subject_focus for update to authenticated
using (user_id=auth.uid() or public.is_coordinator()) with check (user_id=auth.uid() or public.is_coordinator());
drop policy if exists "subject_focus_self_delete" on public.subject_focus;
create policy "subject_focus_self_delete" on public.subject_focus for delete to authenticated
using (user_id=auth.uid() or public.is_coordinator());

create or replace function public.set_my_subject_focus(p_primary_subject_ids bigint[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); primary_ids bigint[]:=coalesce(p_primary_subject_ids,'{}'::bigint[]); invalid_count integer;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select count(*) into invalid_count from unnest(primary_ids) x
  where not exists(select 1 from public.subjects s where s.id=x)
     or (not public.is_coordinator() and not exists(select 1 from public.subject_managers sm where sm.user_id=uid and sm.subject_id=x));
  if invalid_count>0 then raise exception 'invalid_subject_focus'; end if;
  delete from public.subject_focus where user_id=uid;
  insert into public.subject_focus(user_id,subject_id,focus,updated_at)
  select uid,sm.subject_id,case when sm.subject_id=any(primary_ids) then 'primary' else 'auxiliary' end,now()
  from public.subject_managers sm where sm.user_id=uid
  on conflict(user_id,subject_id) do update set focus=excluded.focus,updated_at=now();
  if public.is_coordinator() then
    insert into public.subject_focus(user_id,subject_id,focus,updated_at)
    select uid,s.id,case when s.id=any(primary_ids) then 'primary' else 'auxiliary' end,now()
    from public.subjects s on conflict(user_id,subject_id) do update set focus=excluded.focus,updated_at=now();
  end if;
  return jsonb_build_object('ok',true,'primary_subject_ids',primary_ids);
end; $$;
revoke execute on function public.set_my_subject_focus(bigint[]) from public;
grant execute on function public.set_my_subject_focus(bigint[]) to authenticated;

-- Per-subject next material-upload deadline.
create table if not exists public.subject_management_settings (
  subject_id bigint primary key references public.subjects(id) on delete cascade,
  next_upload_deadline timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.subject_management_settings enable row level security;
drop policy if exists "subject settings read" on public.subject_management_settings;
create policy "subject settings read" on public.subject_management_settings for select to authenticated
using (public.is_coordinator() or public.manages_subject(subject_id));
drop policy if exists "subject settings write" on public.subject_management_settings;
create policy "subject settings write" on public.subject_management_settings for all to authenticated
using (public.is_coordinator() or public.manages_subject(subject_id))
with check (public.is_coordinator() or public.manages_subject(subject_id));

create index if not exists site_events_library_item_view_idx on public.site_events(target_type,target_id,created_at)
where target_type='library_item' and event_type='view';

-- Secure per-subject live report.
create or replace function public.get_subject_management_report(p_subject_id bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not(public.is_coordinator() or public.manages_subject(p_subject_id)) then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'subject_id',s.id,'subject_name',s.name,'subject_code',s.code,
    'next_upload_deadline',sms.next_upload_deadline,'deadline_updated_at',sms.updated_at,
    'managers',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.id,'username',p.username) order by p.username) from public.subject_managers sm join public.profiles p on p.id=sm.user_id where sm.subject_id=s.id),'[]'::jsonb),
    'focus',coalesce((select jsonb_agg(jsonb_build_object('user_id',sf.user_id,'username',p.username,'focus',sf.focus) order by sf.focus,p.username) from public.subject_focus sf join public.profiles p on p.id=sf.user_id where sf.subject_id=s.id),'[]'::jsonb),
    'discussion',jsonb_build_object(
      'questions_7d',(select count(*) from public.questions q where q.subject_id=s.id and q.created_at>=now()-interval '7 days'),
      'questions_30d',(select count(*) from public.questions q where q.subject_id=s.id and q.created_at>=now()-interval '30 days'),
      'unanswered',(select count(*) from public.questions q where q.subject_id=s.id and q.status='unanswered'),
      'discussing',(select count(*) from public.questions q where q.subject_id=s.id and q.status='discussing'),
      'answered',(select count(*) from public.questions q where q.subject_id=s.id and q.status='answered'),
      'answers_30d',(select count(*) from public.answers a join public.questions q on q.id=a.question_id where q.subject_id=s.id and a.created_at>=now()-interval '30 days')
    ),
    'materials',jsonb_build_object(
      'approved_count',(select count(*) from public.library_items li where li.subject_id=s.id and li.status='approved' and li.is_hidden=false and li.item_type<>'folder'),
      'views_total',(select count(*) from public.site_events e where e.event_type='view' and e.target_type='library_item' and exists(select 1 from public.library_items li where li.id::text=e.target_id and li.subject_id=s.id)),
      'views_30d',(select count(*) from public.site_events e where e.event_type='view' and e.target_type='library_item' and e.created_at>=now()-interval '30 days' and exists(select 1 from public.library_items li where li.id::text=e.target_id and li.subject_id=s.id))
    ),
    'videos',jsonb_build_object(
      'published_courses',(select count(*) from public.courses c where c.subject_id=s.id and c.status='published' and c.is_hidden=false),
      'lessons',(select count(*) from public.course_lessons cl join public.courses c on c.id=cl.course_id where c.subject_id=s.id and c.status='published' and c.is_hidden=false),
      'views_total',(select count(*) from public.lesson_views lv join public.course_lessons cl on cl.id=lv.lesson_id join public.courses c on c.id=cl.course_id where c.subject_id=s.id and c.status='published' and c.is_hidden=false),
      'views_30d',(select count(*) from public.lesson_views lv join public.course_lessons cl on cl.id=lv.lesson_id join public.courses c on c.id=cl.course_id where c.subject_id=s.id and c.status='published' and c.is_hidden=false and lv.created_at>=now()-interval '30 days')
    ),
    'generated_at',now()
  ) into result from public.subjects s left join public.subject_management_settings sms on sms.subject_id=s.id where s.id=p_subject_id;
  return coalesce(result,'{}'::jsonb);
end; $$;
revoke execute on function public.get_subject_management_report(bigint) from public;
grant execute on function public.get_subject_management_report(bigint) to authenticated;

commit;
