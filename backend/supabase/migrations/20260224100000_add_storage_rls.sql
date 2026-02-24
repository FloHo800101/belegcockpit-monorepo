-- ============================================================
-- Storage RLS – Mandanten-Isolation für documents-Bucket
--
-- Pfad-Konvention: {tenant_id}/{doc_id}/{filename}
-- Der erste Pfad-Abschnitt ist immer die tenant_id (UUID).
-- Authentifizierte User dürfen nur in ihre eigenen Tenant-Ordner.
-- ============================================================

-- SELECT: User darf nur eigene Tenant-Dateien lesen
create policy "storage_documents_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and tenant_id = split_part(name, '/', 1)::uuid
  )
);

-- INSERT: User darf nur in eigenen Tenant-Ordner hochladen
create policy "storage_documents_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and tenant_id = split_part(name, '/', 1)::uuid
  )
);

-- DELETE: User darf nur eigene Tenant-Dateien löschen
create policy "storage_documents_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and tenant_id = split_part(name, '/', 1)::uuid
  )
);
