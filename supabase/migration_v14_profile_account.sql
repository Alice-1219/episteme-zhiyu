begin;

-- Profile customization for the new account center.
alter table public.profiles
  add column if not exists avatar_key text not null default 'leaf',
  add column if not exists language text not null default 'zh-CN';

alter table public.profiles
  drop constraint if exists profiles_language_check;

alter table public.profiles
  add constraint profiles_language_check
  check (language in ('zh-CN','en'));

alter table public.profiles
  drop constraint if exists profiles_avatar_key_check;

alter table public.profiles
  add constraint profiles_avatar_key_check
  check (avatar_key in ('leaf','book','star','cloud','moon','sun','flower','mountain','wave','cat','fox','owl'));

-- Users may update only their own profile fields. Role remains server-controlled.
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

commit;
