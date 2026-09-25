-- Run once in Supabase SQL Editor.
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles" on public.profiles for update to authenticated using (public.my_role()='admin') with check (public.my_role()='admin');
