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

0) Seed analyze runs from existing live extractions (only if needed for historical docs).
   - `pnpm test:backfill-analyze-runs`

1) Re-parse Azure analyze runs (updates `document_analyze_runs.parsed_data`).
   - `FORCE_REPARSE=1 pnpm test:azure-mappers`

2) Backfill extractions (writes `document_extractions.parsed_data` from analyze runs).
   - `pnpm test:backfill-extractions`

3) Backfill bank transactions (writes `bank_transactions` from parsed extractions).
   - `pnpm test:backfill-bank-transactions`

## Typical flow for invoices/receipts

0) Seed analyze runs from existing live extractions (only if needed for historical docs).
   - `pnpm test:backfill-analyze-runs`

1) Re-parse Azure analyze runs (if needed).
   - `FORCE_REPARSE=1 pnpm test:azure-mappers`

2) Backfill extractions (writes `document_extractions.parsed_data`).
   - `pnpm test:backfill-extractions`

3) Backfill invoices (writes `invoices` from parsed extractions).
   - `pnpm test:backfill-invoices`

## What each script does

- `tests-backend/integration/azure-analyze-cases.ts`
  Uploads PDFs/images from `tests-backend/documents-analyzes/azure-analyze/` to Supabase Storage,
  runs Azure Document Intelligence, detects document type, and applies the appropriate mapper.

- `tests-backend/integration/azure-mappers-cases.ts`
  Re-maps `document_analyze_runs.analyze_result` into `document_analyze_runs.parsed_data`.
  Use `FORCE_REPARSE=1` to re-run for all rows.
  Supports optional filters: `TENANT_ID`, `FROM`, `TO`, `LIMIT_DOCS`.

- `tests-backend/integration/backfill-analyze-runs-from-extractions.ts`
  Seeds missing `document_analyze_runs` entries (`source=live_seed`) from existing
  `document_extractions.raw_result` for Azure-based live documents.
  Supports optional filters: `TENANT_ID`, `FROM`, `TO`, `LIMIT_DOCS`, `DRY_RUN=1`.

- `tests-backend/integration/backfill-extractions-from-analyze.ts`
  Uses analyze runs to upsert `document_extractions` (parsed data + detection meta).
  Supports optional filters: `TENANT_ID`, `FROM`, `TO`, `LIMIT_DOCS`.

- `tests-backend/integration/backfill-bank-transactions.ts`
  Takes `document_extractions.parsed_data.transactions` and upserts `bank_transactions`.
  Uses replace strategy (deletes existing rows per document, then upserts new ones).

- `tests-backend/integration/backfill-invoices.ts`
  Takes invoice-like `document_extractions.parsed_data` and upserts `invoices`.
  Amount resolution via `resolveInvoiceAmount()` (shared module in `invoice-amount-candidates.ts`):
  prefers totalGross/totalNet, falls back to signed line item sum,
  and uses positive-only sum when signed total is zero or negative
  (e.g. hotel invoices where a payment line cancels out the charges).

- `tests-backend/integration/invoice-amount-resolve.test.ts`
  Deno unit tests for `resolveInvoiceAmount`: totalGross/totalNet priority,
  signed line item summing, discount handling, hotel invoice with payment
  (negative line item), Math.abs regression guard, and floating-point rounding
  (signedSum near-zero due to IEEE 754 is rounded before comparison).
  Run with: `deno test tests-backend/integration/invoice-amount-resolve.test.ts --no-lock`

- `tests-backend/integration/azure-invoice-hotel.test.ts`
  Deno unit tests for hotel invoice extraction (Mercure case) and vendor-name safety:
  - `extractInvoiceNumber` with "Rechnungsnr." period-separated format
  - `extractLabeledParty` via "Gastname" buyer label
  - `cleanPartyName` salutation stripping (Herrn/Herr/Frau)
  - Full mapper end-to-end: vendorName, invoiceNumber, buyerName, lineItems, amount
  - **CustomerName-as-vendor guard**: Ensures vendorName is NOT set to the buyer name
    when Azure provides only CustomerName and no vendor fields (Apple iCloud case).
  - **resolvePreferredDate**: Verifies DD.MM.YYYY text is preferred over Azure's swapped
    valueDate (e.g. 05.06.2025 content vs 2025-06-05 valueDate), fallback to valueDate
    when no content exists, and named month parsing ("29. Mai 2025").
  - **totalNet fallback**: Verifies `totalGross - totalVat` calculation when Azure
    doesn't provide SubTotal.
  Run with: `deno test tests-backend/integration/azure-invoice-hotel.test.ts --no-lock`

- `tests-backend/integration/azure-bank-statement-fx.test.ts`
  Deno unit tests for foreign currency detection and counterparty extraction in bank statement mapper.
  Includes Qonto DD/MM date format regression test.
  Run with: `deno test tests-backend/integration/azure-bank-statement-fx.test.ts --no-lock`

- `tests-backend/integration/azure-invoice-vendor-name.test.ts`
  Deno unit tests for vendor name extraction edge cases in invoice mapper.
  Covers single-char logo rejection (e.g. Notion "N"), short multi-char names (e.g. "DB"),
  and fallback through candidate list.
  Run with: `deno test tests-backend/integration/azure-invoice-vendor-name.test.ts --no-lock`

- `tests-backend/integration/azure-receipt-multi.test.ts`
  Deno unit tests for receipt mapper: multi-receipt pages, OCR fallback, currency fix, date fallback,
  DB Online-Ticket detection (specific bank keywords), amount-reversal sanity check (Total < Subtotal swap),
  document type detection for receipt keywords (incl. Tankbelege, Parktickets), and Umsatzsteuer email detection.
  Run with: `deno test tests-backend/integration/azure-receipt-multi.test.ts --no-lock`

- `tests-backend/integration/review-extraction.ts`
  Review script: Downloads PDF from Supabase Storage + exports `raw_result` and `parsed_data`
  as JSON files into `tests-backend/output/` for manual or Claude Code review.
  Supports `DOC_ID`, `TENANT_ID`, `LIMIT_DOCS` filters; `CLEANUP=1` to clear output dir first.
  Run with: `deno run -A tests-backend/integration/review-extraction.ts`

- `tests-backend/integration/review-extraction-auto.ts`
  Automated plausibility check on `parsed_data` — flags known error patterns (salutation as buyerName,
  trailing punctuation in vendorName, totalNet > totalGross, vatRate > 1, missing fields, etc.)
  without reading PDFs or raw_result. Use as pre-filter before visual review.
  Run with: `deno run -A tests-backend/integration/review-extraction-auto.ts`

- `tests-backend/REVIEW_PROMPT.md`
  Copy-paste prompt template for running the full review workflow (auto-check + subagent visual review).

## Azure Mapper Architecture

The Azure mapping layer is in `supabase/functions/_shared/azure-mappers/` and uses a facade pattern:

- **`azure-mappers.ts`** — Facade, re-exports the 4 mapper functions.
- **`invoice-mapper.ts`** — Handles invoices (prebuilt-invoice model).
  Includes totalNet fallback: calculates `totalGross - totalVat` when Azure doesn't provide `SubTotal`.
- **`receipt-mapper.ts`** — Handles receipts (prebuilt-receipt model). Supports multi-receipt pages
  (e.g. travel expense scans with multiple tickets on one page):
  1. Multi-document: Iterates over all `documents[]` when Azure detects multiple receipts.
  2. OCR fallback: When only one document found but OCR text contains multiple `€ X,XX` amounts,
     extracts all amounts as line items and sums them as `totalGross`.
  3. Currency fix: Prefers OCR-based currency detection (`€` → EUR) over Azure field values.
  4. Date fallback: When Azure has no `TransactionDate`, extracts the latest date from OCR text
     (e.g. `DD.MM.YYYY` patterns) as `invoiceDate`. Applied in all three code paths.
  5. Date fix: Uses `resolvePreferredDate()` instead of `getDate()` for `TransactionDate` to
     prevent Azure's DD.MM→MM.DD swap on German dates.
  6. totalNet fallback: Calculates `totalGross - totalVat` when Azure doesn't provide `Subtotal`.
- **`bank-statement-mapper.ts`** — Handles bank statements. Orchestrates three extraction paths:
  1. `extractTransactionsFromItems` — From Azure-extracted structured items.
  2. `extractTransactionsFromStatementLines` — From OCR line patterns.
  3. `extractTransactions` — Legacy fallback (single-line regex).
  Results from (1) and (2) are merged via `mergeBankStatementTransactions`.
- **`layout-mapper.ts`** — Fallback for generic layout analysis.

### Helper modules

- **`bank-statement-transactions.ts`** — Transaction extraction, merge logic, and reference block parsing:
  - `parseReferenceBlock()` — Parses multi-line reference blocks to extract counterparty name,
    BIC/IBAN, structured fields (EREF, MREF, CRED), value date, and clean reference text.
  - `extractCounterpartyName()` — Strips booking-type keywords (Gutschrift, Lastschrift, etc.)
    from description text. Handles keywords both at the start and mid-string (e.g. when Azure
    merges reference noise from a previous transaction into the current description).
  - `classifyBookingType()` — Maps German transaction types (FOLGELASTSCHRIFT, GUTSCHRIFT, etc.)
    to semantic booking types (direct_debit, transfer, fee, card_payment, interest).
  - `isDateOnlyLine()` — Detects standalone date lines (DD.MM.YYYY, DD/MM, DD.MM) to filter
    them from description lines. Supports both dot and slash separators (e.g. Qonto format).
  - `lineStartsWithDate()` — Strict date matching (only lines starting with a date), used to
    prevent value dates in parentheses from being misidentified as transaction boundaries.
  - `findTransactionBlock()` — Locates OCR lines for a given transaction (date + amount).
    When multiple date lines match within the lookahead window, picks the **closest** date
    to the amount line. This prevents valuta dates of previous transactions from being
    mistaken as the block start (e.g. ING statements where all transactions share the
    same booking date). Falls back to `amountMatched: false` if no amount match is found.
  - `isStatementBoilerplateLine()` — Detects bank statement page headers, footers, balance
    summaries, legal text, and barcode IDs. Used as a stop-signal when collecting reference
    blocks to prevent page-break noise from bleeding into transaction data.
  - `mergeBankStatementTransactions()` — Deduplicates and merges items-based and line-based
    transactions using date+amount matching and text similarity scoring. Post-merge filter
    removes unmatched lines whose date+absolute amount matches any items-sourced transaction,
    catching phantom lines (ING value-date echoes) and opposite-sign duplicates (Qonto
    Eingänge/Ausgänge sections).
- **`bank-statement-fx.ts`** — Foreign currency detection and exchange rate extraction.
- **`parse-utils.ts`** — Shared parsing (dates, amounts, IBAN, BIC, currency, text normalization).
  - `extractIban()` — Two-stage IBAN extraction with length validation (15-34 chars) and
    trailing-alpha rejection (prevents e.g. "DE70...DATUM" corruption).
  - `extractIbanFromLine()` — Per-line IBAN extraction for counterparty IBANs.
- **`azure-field-helpers.ts`** — Type definitions and field accessors for Azure response format.
  - `resolvePreferredDate()` — Always prefers DD.MM.YYYY text parsing over Azure's `valueDate`,
    which often swaps day and month for German dates (e.g. 05.06.2025 → 2025-06-05 instead of 2025-05-06).
- **`party-extraction.ts`** — Vendor/buyer name extraction from OCR text.
  - `BUYER_LABELS` includes hotel-specific labels ("Gastname", "Gast") for guest name extraction.
  - `cleanPartyName()` — Normalizes and validates party name candidates. Rejects single-character
    values (e.g. logo letters like "N" misidentified by Azure DI), metadata lines, and invoice numbers.
    Strips salutation prefixes (Herrn, Herr, Frau, Mr., Mrs., Ms.) from person names.
- **`installment-plan.ts`** — Tax installment plan and invoice number extraction.
  - `extractInvoiceNumber()` handles period-abbreviated labels ("Rechnungsnr." with optional `.`).
- **`upsert-helpers.ts`** — Shared utility functions used by both the Edge Function
  (`process-document`) and Node.js backfill scripts:
  - `normalizeString()` — Trims whitespace, returns null for empty/non-string values.
  - `coerceDate()` — Parses ISO, DD.MM.YYYY, and YYYYMMDD date formats to `YYYY-MM-DD`.
  - `toNumber()` — Converts number/string values (handles German comma decimals).
  - `buildTransactionReference()` — Prefers dedicated reference field over description.

### Document type detection (`document-type-detection.ts`)

Classifies documents into `invoice`, `bank_statement`, `receipt`, or `unknown` using:
- Keyword matching (bank, invoice, tax notice, payroll, receipt)
- Structural patterns (transaction lines, balances, invoice numbers)
- Azure field presence (InvoiceId, TaxDetails, etc.)
- Invoice keyword priority: When "Rechnung"/"Invoice" is present and no bank keywords
  match, invoice wins over bank_statement (prevents false classification of invoices
  with IBAN in payment footer and dated line items).
- Invoice number detection: Matches abbreviations like `Rechnungsnr.`, `Re-Nr.`,
  `Invoice No.` etc. in addition to full forms.

Bank keywords use specific terms (`buchungstag`, `buchungstext`, `buchung / verwendungszweck`)
instead of the generic `buchung` to avoid false positives on train tickets ("Die Buchung Ihres
Online-Tickets").

Receipt detection uses keywords: `einzelkarte`, `fahrkarte`, `fahrschein`, `quittung`,
`kassenbon`, `kassenbeleg`, `kundenbeleg`, `reisekosten`, `ticket`, `online-ticket`,
`bitte entwerten`, `please validate`, `tankstelle`, `eur/liter`, `saeulen`, `parkhaus`,
`parkdauer`, `parkgebuehr`.
Requires >= 2 keyword hits for `receipt` classification.

Tax notice detection includes keyword `zahllast` (for Umsatzsteuer emails).

## Data flow

```
PDF/Image → Azure Document Intelligence → analyze_result (JSON)
         → document type detection (keyword + structure + Azure signals)
         → document_analyze_runs.parsed_data (via appropriate mapper)
         → document_extractions.parsed_data (via backfill-extractions)
         → bank_transactions / invoices (via backfill scripts)
```

Live `process-document` writes `document_extractions` directly and now also persists
Azure-based runs in `document_analyze_runs` (`source=live_process`) for reprocessing.

## Notes

- `bank_transactions` and `invoices` are derived tables.
- If `document_extractions.parsed_data` is empty or missing fields, downstream
  backfills will insert nothing.
- `pnpm test:azure-analyze` uploads local fixture files from
  `tests-backend/documents-analyzes/azure-analyze/`.
- For already uploaded Supabase documents, prefer calling Edge Function
  `process-document` with `documentId` to avoid duplicate uploads.
- Test fixture: `JK_Bank_Example.pdf` — 9 transactions (Kontoauszug 12/2014),
  used as reference for bank statement mapping quality validation.
