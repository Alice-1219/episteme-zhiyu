alter table public.library_items drop constraint if exists library_items_file_source_check;
alter table public.library_items add constraint library_items_file_source_check check (
  (item_type = 'folder' and storage_path is null and external_url is null)
  or
  (item_type = 'file' and provider = 'supabase' and (storage_path is not null or status = 'pending'))
  or
  (item_type = 'embed' and external_url is not null)
);
