# belegcockpit-monorepo
Upload inbox and intelligent matching of documents and bank transactions.

## Manual Test Setup (hosted Supabase)

Quickstart:
- Setup (Tenant + Membership + uploads from `tests-backend/documents`): `pnpm test:manual:setup`
- Cleanup: `pnpm test:manual:cleanup`

## Development

Required environment variables: see `.env.example`.

Recommended local files:
- `.env.live.local` (for integration tests and ops scripts -> `SUPABASE_LIVE_*`)
  - Also keep Azure Document Intelligence secrets here for local Edge testing:
    `AZURE_DOCINT_ENDPOINT`, `AZURE_DOCINT_KEY`, `PROCESS_DOCUMENT_TOKEN`, `TEST_DOCUMENT_UPLOAD_TOKEN`

Tests:
- Integration (hosted Supabase): `pnpm test:integration`
- Analyze fixtures (Supabase storage):
  - XML parser: `pnpm test:xml-parser` (writes runs to `document_xml_parse_runs`)
  - PDF embedded XML: `pnpm test:pdf-embedded-xml`
  - Azure analyze: `pnpm test:azure-analyze` (requires `AZURE_DOCINT_ENDPOINT`, `AZURE_DOCINT_KEY`)
  - Azure mappers: `pnpm test:azure-mappers` (reads latest runs from `document_analyze_runs`)

Operations:
- Upload: `pnpm upload:documents -- <tenantId> <fileOrFolderPath> [uploadedByUserId] [--recursive]`

## Matching Live Replay (hosted Supabase)

Prerequisite:
- Apply migration `supabase/migrations/20260109090000_add_matching_run_tracking.sql` to the target Supabase instance.

Matching engine notes:
- Core engine lives in `src/matching-engine` (pipeline + matchers + persistence helpers).
- Pipeline entrypoint: `run_pipeline` with optional `debug: true` for summary counters.
- Persistence helpers (`toApplyOps`, `toAuditRecord`) are used by the live replay repo adapter.
- Structured invoice data now lives in `invoices` (not `documents`).

Run (writes real matches + audit data, and generates an HTML report):
- `SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... FROM=... TO=... pnpm matching:live-replay`
- Optional limits: `LIMIT_DOCS=... LIMIT_TXS=...`
- Report output: `tests/output/matching/report-<tenant>-<run_id>.html`

Cleanup (restores previous doc/tx state, deletes run data):
- `SUPABASE_LIVE_URL=... SUPABASE_LIVE_SERVICE_ROLE_KEY=... TENANT_ID=... RUN_ID=... pnpm matching:cleanup-run`

## Manual Testing (hosted Supabase)

1) Deploy Edge Function: `test-document-upload` under `supabase/functions/test-document-upload/`.
2) Set a secret in Supabase (recommended): `TEST_DOCUMENT_UPLOAD_TOKEN`.
3) Open `tests-frontend/test-document-upload.html` and paste the Function URL + token + `tenantId`, then upload a file.
