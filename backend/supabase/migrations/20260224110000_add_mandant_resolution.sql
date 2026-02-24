-- ============================================================
-- Mandant-Auflösungs-Status für bank_transactions
--
-- Wird vom Frontend gesetzt wenn der Mandant eine Transaktion
-- manuell klärt (kein Beleg, Eigenbeleg, Privatausgabe).
-- Persistiert über Matching-Runs hinweg.
-- ============================================================

alter table public.bank_transactions
  add column if not exists mandant_resolution text
  check (mandant_resolution in ('no_receipt', 'self_receipt', 'private', 'refund_confirmed'));
