create or replace function public.review_library_item(p_item_id uuid,p_status text)
returns public.library_items language plpgsql security definer set search_path=public as $$
declare v_item public.library_items; v_uid uuid:=auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_status not in ('approved','rejected') then raise exception 'invalid_review_status'; end if;
  select * into v_item from public.library_items where id=p_item_id;
  if not found then raise exception 'library_item_not_found'; end if;
  if not (public.is_coordinator() or public.manages_subject(v_item.subject_id)) then raise exception 'not_authorized'; end if;
  update public.library_items
  set status=p_status,review_stage=p_status,is_hidden=(p_status<>'approved'),
      approved_by=case when p_status='approved' then v_uid else null end,
      approved_at=case when p_status='approved' then now() else null end,
      updated_at=now()
  where id=p_item_id returning * into v_item;
  return v_item;
end; $$;

revoke all on function public.review_library_item(uuid,text) from public,anon;
grant execute on function public.review_library_item(uuid,text) to authenticated;
