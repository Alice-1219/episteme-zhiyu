begin;

alter table public.profiles
  add column if not exists avatar_key text not null default 'leaf',
  add column if not exists language text not null default 'zh-CN';

alter table public.profiles drop constraint if exists profiles_language_check;
alter table public.profiles add constraint profiles_language_check
  check (language in ('zh-CN','en'));

alter table public.profiles drop constraint if exists profiles_avatar_key_check;
alter table public.profiles add constraint profiles_avatar_key_check
  check (avatar_key in ('leaf','book','star','cloud','moon','sun','flower','mountain','wave','cat','fox','owl'));

-- Never expose whole-row UPDATE to authenticated clients: role must stay server-controlled.
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;
revoke update on public.profiles from authenticated;

create or replace function public.update_my_profile(
  p_username text default null,
  p_avatar_key text default null,
  p_language text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_username is not null and (length(trim(p_username)) < 1 or length(trim(p_username)) > 30) then raise exception 'invalid username'; end if;
  if p_avatar_key is not null and p_avatar_key not in ('leaf','book','star','cloud','moon','sun','flower','mountain','wave','cat','fox','owl') then raise exception 'invalid avatar'; end if;
  if p_language is not null and p_language not in ('zh-CN','en') then raise exception 'invalid language'; end if;
  if p_username is not null and exists (select 1 from public.profiles where lower(username)=lower(trim(p_username)) and id<>auth.uid()) then raise exception 'username already used'; end if;
  update public.profiles
  set username=coalesce(trim(p_username),username), avatar_key=coalesce(p_avatar_key,avatar_key), language=coalesce(p_language,language)
  where id=auth.uid()
  returning * into r;
  return r;
end;
$$;

grant execute on function public.update_my_profile(text,text,text) to authenticated;

commit;
