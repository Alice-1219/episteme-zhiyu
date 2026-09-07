begin;

-- Extend invites so one code can represent a role and, for coordinator invites,
-- optionally cover multiple subjects.
alter table public.manager_invites add column if not exists label text;
alter table public.manager_invites add column if not exists role text not null default 'subject_manager';

alter table public.manager_invites drop constraint if exists manager_invites_role_check;
alter table public.manager_invites add constraint manager_invites_role_check
  check (role in ('subject_manager','coordinator'));

create table if not exists public.manager_invite_subjects (
  invite_id uuid not null references public.manager_invites(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  primary key (invite_id, subject_id)
);

alter table public.manager_invite_subjects enable row level security;
drop policy if exists "coordinator manage invite subjects" on public.manager_invite_subjects;
create policy "coordinator manage invite subjects"
on public.manager_invite_subjects for all
to authenticated
using (public.is_coordinator())
with check (public.is_coordinator());

create or replace function public.claim_subject_manager_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.manager_invites%rowtype;
  subject_count integer := 0;
  assigned_count integer := 0;
  new_role text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv
  from public.manager_invites
  where upper(trim(code)) = upper(trim(p_code))
    and active = true
  limit 1;

  if not found then
    raise exception 'invalid invite';
  end if;

  new_role := coalesce(inv.role, 'subject_manager');

  if new_role = 'coordinator' then
    update public.profiles set role = 'coordinator' where id = auth.uid();
  else
    update public.profiles set role = 'subject_manager'
    where id = auth.uid() and role = 'member';
  end if;

  if exists (select 1 from public.manager_invite_subjects where invite_id = inv.id) then
    insert into public.subject_managers(user_id, subject_id)
    select auth.uid(), mis.subject_id
    from public.manager_invite_subjects mis
    where mis.invite_id = inv.id
    on conflict do nothing;

    select count(*) into subject_count
    from public.manager_invite_subjects where invite_id = inv.id;
    select count(*) into assigned_count
    from public.subject_managers sm
    where sm.user_id = auth.uid()
      and sm.subject_id in (select subject_id from public.manager_invite_subjects where invite_id = inv.id);
  elsif inv.subject_id is not null then
    insert into public.subject_managers(user_id, subject_id)
    values (auth.uid(), inv.subject_id)
    on conflict do nothing;
    subject_count := 1;
    assigned_count := 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'role', new_role,
    'invite_id', inv.id,
    'label', inv.label,
    'subject_count', subject_count,
    'assigned_count', assigned_count
  );
end;
$$;

grant execute on function public.claim_subject_manager_invite(text) to authenticated;

commit;
