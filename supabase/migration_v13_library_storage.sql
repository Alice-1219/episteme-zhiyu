begin;

create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.library_items(id) on delete cascade,
  subject_id bigint not null references public.subjects(id) on delete cascade,
  name text not null,
  item_type text not null default 'file' check (item_type in ('folder','file','embed')),
  provider text not null default 'supabase' check (provider in ('supabase','notion','google_drive','baidu','tencent','external')),
  storage_path text,
  external_url text,
  description text,
  mime_type text,
  file_size bigint,
  is_hidden boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_items_file_source_check check (
    (item_type='folder' and storage_path is null and external_url is null)
    or (item_type='file' and provider='supabase' and storage_path is not null)
    or (item_type='embed' and external_url is not null)
  )
);

create index if not exists library_items_parent_idx on public.library_items(parent_id);
create index if not exists library_items_subject_idx on public.library_items(subject_id);
create index if not exists library_items_hidden_idx on public.library_items(is_hidden);

create or replace function public.library_item_public_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, is_hidden from public.library_items where id = p_id
    union all
    select li.id, li.parent_id, li.is_hidden from public.library_items li join chain c on c.parent_id = li.id
  )
  select exists(select 1 from chain) and not exists(select 1 from chain where is_hidden=true);
$$;

alter table public.library_items enable row level security;

drop policy if exists "library public visible read" on public.library_items;
create policy "library public visible read" on public.library_items for select to anon, authenticated using (public.library_item_public_visible(id));

drop policy if exists "library manager read" on public.library_items;
create policy "library manager read" on public.library_items for select to authenticated using (public.is_coordinator() or public.manages_subject(subject_id) or created_by=auth.uid());

drop policy if exists "library manager insert" on public.library_items;
create policy "library manager insert" on public.library_items for insert to authenticated with check (created_by=auth.uid() and (public.is_coordinator() or public.manages_subject(subject_id)));

drop policy if exists "library manager update" on public.library_items;
create policy "library manager update" on public.library_items for update to authenticated using (public.is_coordinator() or public.manages_subject(subject_id) or created_by=auth.uid()) with check (public.is_coordinator() or public.manages_subject(subject_id) or created_by=auth.uid());

drop policy if exists "library manager delete" on public.library_items;
create policy "library manager delete" on public.library_items for delete to authenticated using (public.is_coordinator() or public.manages_subject(subject_id) or created_by=auth.uid());

insert into storage.buckets (id,name,public,file_size_limit)
values ('episteme-library','episteme-library',false,null)
on conflict (id) do update set public=false,file_size_limit=null;

drop policy if exists "library storage visible read" on storage.objects;
create policy "library storage visible read" on storage.objects for select to anon, authenticated using (bucket_id='episteme-library' and public.library_item_public_visible(nullif(split_part(name,'/',2),'')::uuid));

drop policy if exists "library storage manager insert" on storage.objects;
create policy "library storage manager insert" on storage.objects for insert to authenticated with check (bucket_id='episteme-library' and exists(select 1 from public.library_items li where li.id=nullif(split_part(name,'/',2),'')::uuid and li.item_type='file' and li.provider='supabase' and (public.is_coordinator() or public.manages_subject(li.subject_id))));

drop policy if exists "library storage manager update" on storage.objects;
create policy "library storage manager update" on storage.objects for update to authenticated using (bucket_id='episteme-library' and exists(select 1 from public.library_items li where li.id=nullif(split_part(name,'/',2),'')::uuid and (public.is_coordinator() or public.manages_subject(li.subject_id)))) with check (bucket_id='episteme-library' and exists(select 1 from public.library_items li where li.id=nullif(split_part(name,'/',2),'')::uuid and (public.is_coordinator() or public.manages_subject(li.subject_id))));

drop policy if exists "library storage manager delete" on storage.objects;
create policy "library storage manager delete" on storage.objects for delete to authenticated using (bucket_id='episteme-library' and exists(select 1 from public.library_items li where li.id=nullif(split_part(name,'/',2),'')::uuid and (public.is_coordinator() or public.manages_subject(li.subject_id))));

insert into public.library_items (subject_id,name,item_type,provider,created_by)
select s.id,x.name,'folder','supabase',null from public.subjects s cross join (values ('01 · 课本内容'),('02 · IGCSE / Exam'),('03 · 讲义与笔记'),('04 · Past Papers & Mark Schemes'),('05 · 专题与进阶'),('06 · Tools & References')) x(name)
where not exists (select 1 from public.library_items li where li.subject_id=s.id and li.parent_id is null and li.name=x.name and li.item_type='folder');

create or replace function public.library_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists library_items_touch on public.library_items;
create trigger library_items_touch before update on public.library_items for each row execute function public.library_touch_updated_at();

commit;
