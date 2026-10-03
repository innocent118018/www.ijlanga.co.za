update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'text/csv',
  'text/xml',
  'application/xml',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/bmp',
  'image/gif'
]
where id = 'finance-imports';

drop policy if exists "Admins manage finance import files" on storage.objects;
drop policy if exists "Admins read finance import files" on storage.objects;
drop policy if exists "Admins upload finance import files" on storage.objects;

create policy "Admins read finance import files" on storage.objects
for select to authenticated
using (bucket_id = 'finance-imports' and public.is_admin());

create policy "Admins upload finance import files" on storage.objects
for insert to authenticated
with check (bucket_id = 'finance-imports' and public.is_admin());