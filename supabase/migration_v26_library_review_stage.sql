alter table public.library_items add column if not exists review_stage text not null default 'pending';
alter table public.library_items drop constraint if exists library_items_review_stage_check;
alter table public.library_items add constraint library_items_review_stage_check check (review_stage in ('pending','rereview','approved','rejected'));
update public.library_items set review_stage='approved' where status='approved' and is_hidden=false;

drop function if exists public.request_library_item_rereview(uuid);
create function public.request_library_item_rereview(p_item_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_subject_id bigint; v_title text; v_uid uuid:=auth.uid();
begin
 select subject_id,name into v_subject_id,v_title from public.library_items where id=p_item_id;
 if v_subject_id is null then raise exception '资料不存在'; end if;
 if not (public.is_coordinator() or public.manages_subject(v_subject_id)) then raise exception '无权操作该资料'; end if;
 update public.library_items set review_stage='rereview',status='pending',is_hidden=true,updated_at=now() where id=p_item_id;
 insert into public.notifications(user_id,type,title,body,library_item_id)
 select sm.user_id,'resource_review','资料需要重审',coalesce(v_title,'一份资料')||' 需要重新审核。',p_item_id
 from public.subject_managers sm where sm.subject_id=v_subject_id and sm.user_id<>v_uid;
end; $$;
grant execute on function public.request_library_item_rereview(uuid) to authenticated;
