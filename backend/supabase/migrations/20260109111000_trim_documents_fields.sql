alter table public.documents
  drop column if exists receipt_date,
  drop column if exists amount,
  drop column if exists currency,
  drop column if exists vendor;
