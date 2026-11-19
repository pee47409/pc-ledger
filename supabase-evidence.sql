begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pc-ledger-evidence','pc-ledger-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,
allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "pc ledger evidence owner" on storage.objects;
create policy "pc ledger evidence owner" on storage.objects
for all to authenticated
using (
 bucket_id='pc-ledger-evidence'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.pc_ledger_owners where user_id=(select auth.uid()))
)
with check (
 bucket_id='pc-ledger-evidence'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.pc_ledger_owners where user_id=(select auth.uid()))
);
commit;
