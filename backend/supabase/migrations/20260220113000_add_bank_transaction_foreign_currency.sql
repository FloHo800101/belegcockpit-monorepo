alter table public.bank_transactions
  add column if not exists foreign_amount numeric,
  add column if not exists foreign_currency text,
  add column if not exists exchange_rate numeric;

create index if not exists bank_transactions_foreign_currency_idx
  on public.bank_transactions (foreign_currency);
