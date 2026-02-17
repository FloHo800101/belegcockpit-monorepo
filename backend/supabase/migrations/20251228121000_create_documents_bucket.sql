insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
