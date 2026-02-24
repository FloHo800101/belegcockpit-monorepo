-- ============================================================
-- Row Level Security – Mandanten-Isolation
--
-- Jeder authentifizierte User gehört über `memberships` zu
-- einem Tenant. Alle Tabellen mit tenant_id werden so
-- abgesichert, dass ein User nur seine eigenen Daten sieht.
--
-- Edge Functions verwenden den service_role-Key → RLS wird
-- dabei automatisch umgangen (kein Handlungsbedarf).
-- ============================================================

-- Hilfsfunktion: alle tenant_ids des aktuellen Users
-- (Phase 0: immer genau eine; Phase 1+: mehrere möglich)
create or replace function public.get_my_tenant_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select tenant_id from public.memberships where user_id = auth.uid()
$$;

-- ============================================================
-- TENANTS – User sieht nur eigene Tenant-Einträge
-- ============================================================
alter table public.tenants enable row level security;

create policy "tenant_select" on public.tenants
  for select using (
    id in (select public.get_my_tenant_ids())
  );

-- ============================================================
-- MEMBERSHIPS – User sieht nur eigene Mitgliedschaft
-- ============================================================
alter table public.memberships enable row level security;

create policy "membership_select" on public.memberships
  for select using (user_id = auth.uid());

-- ============================================================
-- DOCUMENTS – volle Isolation nach tenant_id
-- ============================================================
alter table public.documents enable row level security;

create policy "documents_select" on public.documents
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "documents_insert" on public.documents
  for insert with check (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "documents_update" on public.documents
  for update using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "documents_delete" on public.documents
  for delete using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- DOCUMENT_EXTRACTIONS – kein eigenes tenant_id, Join über documents
-- ============================================================
alter table public.document_extractions enable row level security;

create policy "document_extractions_select" on public.document_extractions
  for select using (
    document_id in (
      select id from public.documents
      where tenant_id = any(array(select public.get_my_tenant_ids()))
    )
  );

-- ============================================================
-- BANK_TRANSACTIONS – volle Isolation nach tenant_id
-- ============================================================
alter table public.bank_transactions enable row level security;

create policy "bank_transactions_select" on public.bank_transactions
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "bank_transactions_insert" on public.bank_transactions
  for insert with check (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "bank_transactions_update" on public.bank_transactions
  for update using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- INVOICES – volle Isolation nach tenant_id
-- ============================================================
alter table public.invoices enable row level security;

create policy "invoices_select" on public.invoices
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "invoices_insert" on public.invoices
  for insert with check (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "invoices_update" on public.invoices
  for update using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- INVOICE_LINE_ITEMS – volle Isolation nach tenant_id
-- ============================================================
alter table public.invoice_line_items enable row level security;

create policy "invoice_line_items_select" on public.invoice_line_items
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "invoice_line_items_insert" on public.invoice_line_items
  for insert with check (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- MATCH_GROUPS – volle Isolation nach tenant_id
-- ============================================================
alter table public.match_groups enable row level security;

create policy "match_groups_select" on public.match_groups
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

create policy "match_groups_update" on public.match_groups
  for update using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- MATCH_EDGES_DOCS – Isolation nach tenant_id
-- ============================================================
alter table public.match_edges_docs enable row level security;

create policy "match_edges_docs_select" on public.match_edges_docs
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- MATCH_EDGES_TXS – Isolation nach tenant_id
-- ============================================================
alter table public.match_edges_txs enable row level security;

create policy "match_edges_txs_select" on public.match_edges_txs
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- MATCHING_RUNS / AUDIT / SUGGESTIONS / APPLIED_MATCHES
-- Read-only für Frontend (Edge Functions schreiben mit service_role)
-- ============================================================
alter table public.matching_runs enable row level security;

create policy "matching_runs_select" on public.matching_runs
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

alter table public.matching_audit enable row level security;

create policy "matching_audit_select" on public.matching_audit
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

alter table public.matching_suggestions enable row level security;

create policy "matching_suggestions_select" on public.matching_suggestions
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

alter table public.matching_applied_matches enable row level security;

create policy "matching_applied_matches_select" on public.matching_applied_matches
  for select using (
    tenant_id = any(array(select public.get_my_tenant_ids()))
  );

-- ============================================================
-- SYSTEM-TABELLEN ohne tenant_id
-- RLS aktivieren ohne Policies → komplett gesperrt für alle
-- Nicht-service_role-Zugriffe (nur Edge Functions dürfen schreiben)
-- ============================================================
alter table public.document_analyze_runs enable row level security;
alter table public.document_xml_parse_runs enable row level security;
