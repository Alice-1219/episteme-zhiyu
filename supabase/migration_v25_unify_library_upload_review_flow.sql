create or replace function public.enforce_library_upload_review_flow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.item_type <> 'folder' then
    new.status := 'pending';
    new.is_hidden := true;
    new.parent_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_library_upload_review_flow on public.library_items;
create trigger trg_enforce_library_upload_review_flow
before insert on public.library_items
for each row
execute function public.enforce_library_upload_review_flow();
