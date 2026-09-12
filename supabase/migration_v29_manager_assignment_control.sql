-- Episteme 知屿: coordinator-controlled subject manager assignments
-- Alice_lyx, Yvonne Feng (feng03), llangvet are the three manager editors.

create or replace function public.can_edit_manager_positions()
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() in (
    'b3ff97fb-3b6c-4b4c-b348-aa552d3c71e6'::uuid,
    'f964ace6-ed45-459e-8bb7-1cf175185fce'::uuid,
    'd069963e-e049-4c5c-9b2f-71987d6bc512'::uuid
  );
$$;

create or replace function public.can_edit_manager_position()
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_edit_manager_positions();
$$;

create or replace function public.update_subject_manager_position(p_manager_id uuid,p_position_title text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_title text:=nullif(trim(coalesce(p_position_title,'')),''); v_row public.subject_managers%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_edit_manager_positions() then raise exception 'not_allowed'; end if;
  if v_title is null then raise exception 'position_title_required'; end if;
  if length(v_title)>120 then raise exception 'position_title_too_long'; end if;
  update public.subject_managers set position_title=v_title where id=p_manager_id returning * into v_row;
  if not found then raise exception 'manager_not_found'; end if;
  return jsonb_build_object('ok',true,'manager_id',v_row.id,'position_title',v_row.position_title);
end; $$;

create or replace function public.remove_subject_manager_assignment(p_manager_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row public.subject_managers%rowtype; v_uid uuid:=auth.uid(); v_name text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not public.can_edit_manager_positions() then raise exception 'not_allowed'; end if;
  select * into v_row from public.subject_managers where id=p_manager_id;
  if not found then raise exception 'manager_not_found'; end if;
  select name into v_name from public.subjects where id=v_row.subject_id;
  delete from public.subject_managers where id=p_manager_id;
  if exists(select 1 from public.profiles where id=v_row.user_id and role='subject_manager')
     and not exists(select 1 from public.subject_managers where user_id=v_row.user_id)
  then update public.profiles set role='member' where id=v_row.user_id; end if;
  return jsonb_build_object('ok',true,'manager_id',v_row.id,'user_id',v_row.user_id,'subject_id',v_row.subject_id,'subject_name',v_name);
end; $$;

create or replace function public.assign_subject_manager(p_user_id uuid,p_subject_id bigint,p_position_title text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_title text:=nullif(trim(coalesce(p_position_title,'')),''); v_id uuid; v_subject text; v_username text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not public.can_edit_manager_positions() then raise exception 'not_allowed'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'user_not_found'; end if;
  select name into v_subject from public.subjects where id=p_subject_id;
  if v_subject is null then raise exception 'subject_not_found'; end if;
  if v_title is null then v_title:=v_subject||' 学科负责人'; end if;
  if length(v_title)>120 then raise exception 'position_title_too_long'; end if;
  insert into public.subject_managers(user_id,subject_id,position_title)
  values(p_user_id,p_subject_id,v_title)
  on conflict(user_id,subject_id) do update set position_title=excluded.position_title
  returning id into v_id;
  select username into v_username from public.profiles where id=p_user_id;
  update public.profiles set role='subject_manager' where id=p_user_id and role not in ('coordinator','admin');
  return jsonb_build_object('ok',true,'manager_id',v_id,'user_id',p_user_id,'username',v_username,'subject_id',p_subject_id,'subject_name',v_subject,'position_title',v_title);
end; $$;

revoke all on function public.can_edit_manager_positions() from public,anon;
revoke all on function public.can_edit_manager_position() from public,anon;
revoke all on function public.update_subject_manager_position(uuid,text) from public,anon;
revoke all on function public.remove_subject_manager_assignment(uuid) from public,anon;
revoke all on function public.assign_subject_manager(uuid,bigint,text) from public,anon;
grant execute on function public.can_edit_manager_positions() to authenticated;
grant execute on function public.can_edit_manager_position() to authenticated;
grant execute on function public.update_subject_manager_position(uuid,text) to authenticated;
grant execute on function public.remove_subject_manager_assignment(uuid) to authenticated;
grant execute on function public.assign_subject_manager(uuid,bigint,text) to authenticated;
