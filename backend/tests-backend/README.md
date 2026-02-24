# Backend Integration Runbook

Short guide for local backfills and parsing on the hosted Supabase database.
Run all commands below from `backend/`.

## Environment

- Uses `.env.live.local` by default (loaded in scripts).
- Optional filters: `TENANT_ID`, `FROM=YYYY-MM-DD`, `TO=YYYY-MM-DD`, `LIMIT_DOCS`.
- Reprocessing flags:
  - `FORCE_REPROCESS=1` for `pnpm test:azure-analyze` (ignores already-processed-file check).
  - `FORCE_REPARSE=1` for `pnpm test:azure-mappers` (rebuilds parsed_data for existing runs).

## Typical flow for bank statements

1) Re-parse Azure analyze runs (updates `document_analyze_runs.parsed_data`).
   - `FORCE_REPARSE=1 pnpm test:azure-mappers`

2) Backfill extractions (writes `document_extractions.parsed_data` from analyze runs).
   - `pnpm test:backfill-extractions`

3) Backfill bank transactions (writes `bank_transactions` from parsed extractions).
   - `pnpm test:backfill-bank-transactions`

## Typical flow for invoices/receipts

1) Re-parse Azure analyze runs (if needed).
   - `FORCE_REPARSE=1 pnpm test:azure-mappers`

2) Backfill extractions (writes `document_extractions.parsed_data`).
   - `pnpm test:backfill-extractions`

3) Backfill invoices (writes `invoices` from parsed extractions).
   - `pnpm test:backfill-invoices`

## What each script does

- `tests-backend/integration/azure-mappers-cases.ts`
  Re-maps `document_analyze_runs.analyze_result` into `document_analyze_runs.parsed_data`.
  Use `FORCE_REPARSE=1` to re-run for all rows.

- `tests-backend/integration/backfill-extractions-from-analyze.ts`
  Uses analyze runs to upsert `document_extractions` (parsed data + detection meta).

- `tests-backend/integration/backfill-bank-transactions.ts`
  Takes `document_extractions.parsed_data.transactions` and upserts `bank_transactions`.

- `tests-backend/integration/backfill-invoices.ts`
  Takes invoice-like `document_extractions.parsed_data` and upserts `invoices`.

## Notes

- `bank_transactions` and `invoices` are derived tables.
- If `document_extractions.parsed_data` is empty or missing fields, downstream
  backfills will insert nothing.
- `pnpm test:azure-analyze` uploads local fixture files from
  `tests-backend/documents-analyzes/azure-analyze/`.
- For already uploaded Supabase documents, prefer calling Edge Function
  `process-document` with `documentId` to avoid duplicate uploads.
