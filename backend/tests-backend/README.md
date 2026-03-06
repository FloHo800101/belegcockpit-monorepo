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

- `tests-backend/integration/bank-statement-quality.test.ts`
  Deno unit tests for bank statement data quality fixes:
  - Phantom transaction filtering (closing balance amounts, all-same-amount garbage patterns)
  - `cleanBankCounterpartyName()` (VISA prefix stripping, STEUERNR rejection, reference number
    rejection, Dauerauftrag/Gehalt prefix stripping)
  - `coerceDate()` validation (invalid month rejection, far-future date rejection)
  - Timesheet anti-bank-statement detection (Zeiterfassungsbogen keywords)
  Run with: `deno test tests-backend/integration/bank-statement-quality.test.ts --no-lock`

- `tests-backend/integration/azure-invoice-vendor-name.test.ts`
  Deno unit tests for vendor name extraction edge cases in invoice mapper.
  Covers single-char logo rejection (e.g. Notion "N"), short multi-char names (e.g. "DB"),
  fallback through candidate list, business-suffix preference over short logo names
  (e.g. "X XING" → "New Work SE"), tax-free invoice totalNet/totalVat fallback,
  multi-line anrede buyerName extraction (e.g. "Herr\nFlorian Hoffmann"),
  and Metro receipt extraction (RECHNUNGS-NR. hyphenated label + buyerName before KUNDE).
  Also covers mapper sanity fixes: lineItem totalPrice decimal correction (qty×unit vs Azure amount),
  vatItem filtering (amount > totalGross, negative netAmount), country/legal-form-only party rejection,
  and negative totalNet correction.
  Run with: `deno test tests-backend/integration/azure-invoice-vendor-name.test.ts --no-lock`

- `tests-backend/integration/azure-receipt-multi.test.ts`
  Deno unit tests for receipt mapper: multi-receipt pages, OCR fallback, currency fix, date fallback,
  DB Online-Ticket detection (specific bank keywords), amount-reversal sanity check (Total < Subtotal swap),
  parking ticket total-line dedup (skip "Gesamt brutto"/"Betrag" summary lines in OCR extraction),
  document type detection for receipt keywords (incl. Tankbelege, Parktickets), Umsatzsteuer email detection,
  default-to-invoice fallback (no more `unknown`), "KUNDEN BELEG" (with space) detection,
  and OCR-fallback-path totalNet calculation.
  Run with: `deno test tests-backend/integration/azure-receipt-multi.test.ts --no-lock`

- `tests-backend/integration/review-extraction.ts`
  Review script: Downloads PDF from Supabase Storage + exports `raw_result` and `parsed_data`
  as JSON files into `tests-backend/output/` for manual or Claude Code review.
  Supports `DOC_ID`, `TENANT_ID`, `LIMIT_DOCS` filters; `CLEANUP=1` to clear output dir first.
  Run with: `deno run -A tests-backend/integration/review-extraction.ts`

- `tests-backend/integration/review-extraction-auto.ts`
  Automated plausibility check on `parsed_data` — flags known error patterns (salutation as buyerName,
  trailing punctuation in vendorName, totalNet > totalGross, vatRate > 1, missing fields,
  missing invoiceNumber for invoice documents, etc.)
  without reading PDFs or raw_result. Use as pre-filter before visual review.
  Run with: `deno run -A tests-backend/integration/review-extraction-auto.ts`

- `tests-backend/integration/diagnose-missing-invoice-no.ts`
  Diagnostic script: finds all invoices with `invoice_no IS NULL` for a tenant and categorizes them
  as BACKFILL_BUG (parsed_data has invoiceNumber but DB is NULL), MAPPER_BUG (parsed_data also NULL),
  or NO_EXTRACTION (no extraction exists). Useful for tracking invoice number extraction coverage.
  Run with: `TENANT_ID=... deno run -A tests-backend/integration/diagnose-missing-invoice-no.ts`

- `tests-backend/integration/analyze-buyer-names.ts`
  Diagnostic script: analyzes buyer_name quality for a tenant. Loads all invoices, re-runs
  `cleanPartyName` on parsed_data, and categorizes results into: correct (Florian Hoffmann),
  garbage (would be filtered by new rules), airline-normalized, NULL, and other.
  Useful for validating buyer_name extraction coverage and garbage filter effectiveness.
  Run with: `TENANT_ID=... deno run -A tests-backend/integration/analyze-buyer-names.ts`

- `tests-backend/REVIEW_PROMPT.md`
  Quick-start reference for the review workflow. The full 8-phase workflow (Auto-Check -> Visual Review
  -> Klassifizierung -> Fix -> Tests -> Re-Parse -> Backfill -> Redeploy) with fix-patterns and
  Azure-limitation reference is in the Claude Code Skill: `.claude/skills/extraction-review.md`.

## Azure Mapper Architecture

The Azure mapping layer is in `supabase/functions/_shared/azure-mappers/` and uses a facade pattern:

- **`azure-mappers.ts`** — Facade, re-exports the 4 mapper functions.
- **`invoice-mapper.ts`** — Handles invoices (prebuilt-invoice model).
  Includes totalNet fallback: calculates `totalGross - totalVat` when Azure doesn't provide `SubTotal`.
  Also derives totalVat from vatItems sum when Azure doesn't provide `TotalTax` but has `TaxDetails`.
  Tax-free fallback: sets `totalNet = totalGross` and `totalVat = 0` when neither Azure TotalTax
  nor vatItems provide tax amounts (e.g. Führungszeugnis with 0% tax).
  LineItem sanity: corrects `totalPrice` when `quantity × unitPrice` differs by factor >100
  (Azure OCR decimal error, e.g. "7.560.,00 €" → 7.56 instead of 7560).
  VatItem sanity: filters vatItems where amount > totalGross (OCR decimal misread) or
  netAmount < 0 (deposit transfers wrongly mapped). After filtering, recalculates totalVat/totalNet.
  Negative totalNet guard: when totalNet < 0 but totalGross > 0, recalculates from vatItems or resets.
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
     Applied in all three code paths (multi-doc, OCR-fallback, single-receipt).
  7. Total-line dedup: OCR extraction skips summary lines (`Gesamt brutto`, `Betrag`, `Summe`, `Total`,
     `Endbetrag`) to prevent double-counting the same amount.
- **`bank-statement-mapper.ts`** — Handles bank statements. Orchestrates three extraction paths:
  1. `extractTransactionsFromItems` — From Azure-extracted structured items.
  2. `extractTransactionsFromStatementLines` — From OCR line patterns.
  3. `extractTransactions` — Legacy fallback (single-line regex).
  Results from (1) and (2) are merged via `mergeBankStatementTransactions`.
  Post-extraction quality gates:
  - `filterPhantomTransactions()` — Removes transactions whose absolute amount matches
    the opening/closing balance (summary lines parsed as transactions), and detects
    all-identical-amount patterns (e.g. 110x "7510.PST3" at 0.03 from timesheet project
    codes parsed by the legacy pipeline).
  - `cleanBankCounterpartyName()` — Strips VISA card prefixes + trailing transaction IDs,
    detects tax reference strings (STEUERNR) and pure reference numbers as counterparty,
    strips "Dauerauftrag/Terminueberw." and "Gehalt/Rente" prefixes.
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
  - `cleanBankCounterpartyName()` — Post-processing cleanup for bank transaction counterparty
    names. Strips VISA card prefixes and trailing transaction-specific codes (e.g.
    "VISA LIMEHOME GMBH KXRVYZEU" → "LIMEHOME GMBH"), returns null for tax reference strings
    (STEUERNR) and pure reference numbers, strips "Dauerauftrag/Terminueberw." and
    "Gehalt/Rente" booking-type prefixes.
- **`bank-statement-fx.ts`** — Foreign currency detection and exchange rate extraction.
- **`parse-utils.ts`** — Shared parsing (dates, amounts, IBAN, BIC, currency, text normalization).
  - `parsePercent()` — Handles both dot-decimal ("19.00 %") and German comma-decimal ("19,00 %")
    formats. Distinguishes dot-as-decimal from dot-as-thousand-separator.
  - `extractIban()` — Two-stage IBAN extraction with length validation (15-34 chars) and
    trailing-alpha rejection (prevents e.g. "DE70...DATUM" corruption).
  - `extractIbanFromLine()` — Per-line IBAN extraction for counterparty IBANs.
- **`azure-field-helpers.ts`** — Type definitions and field accessors for Azure response format.
  - `resolvePreferredDate()` — Always prefers DD.MM.YYYY text parsing over Azure's `valueDate`,
    which often swaps day and month for German dates (e.g. 05.06.2025 → 2025-06-05 instead of 2025-05-06).
- **`party-extraction.ts`** — Vendor/buyer name extraction from OCR text.
  - `BUYER_LABELS` includes hotel-specific labels ("Gastname", "Gast") for guest name extraction.
  - `isLikelyGarbageName()` — Detects OCR garbage that should never be accepted as a party name:
    receipt/POS keywords (BARBELEG, ZW-SUMME, PASSEND, etc.), masked card numbers (XXXXX1212),
    amount strings (16,73 EUR), flight date codes (18JUN23), insurance period refs (DV 01.23),
    short alphanumeric reference codes (CI4Z9A, DA3CD00400), product-line patterns
    (455 BLUETOOTH HEADPHONES), instruction text (MIT APP BESTELLEN...), booking reference codes
    (LHA-P-KIB34-...), generic hotel/station words (HOTELS, HBF), legal text fragments
    (Verordnung...), and address strings (Postfach).
  - `normalizeAirlineName()` — Converts airline-style reversed names to normal format:
    "HOFFMANN / FLORIAN MR" → "Florian Hoffmann". Applied automatically in `cleanPartyName()`.
  - `cleanPartyName()` — Normalizes and validates party name candidates. Rejects single-character
    values (e.g. logo letters like "N" misidentified by Azure DI), metadata lines, address lines,
    invoice numbers, garbage OCR text, country names (e.g. "DEUTSCHLAND"), and pure legal form
    strings (e.g. "GmbH & Co. KG" without an actual company name).
    Strips salutation prefixes (Herrn, Herr, Frau, Mr., Mrs., Ms.) from person names.
    Iterates through all lines of multi-line values (e.g. "Herr\nFlorian Hoffmann") instead of
    only using the first line. Normalizes airline-format names as final step.
  - `isLikelyAddressOrContactLine()` — Also catches compound street names (e.g. "LINDEMANNSTR.").
  - `looksLikeCompanyLine()` — Rejects strings with high digit-to-letter ratio (e.g. "M22076230495")
    to prevent invoice/customer numbers from being mistaken as company names.
  - `pickPrimaryParty()` — Prefers candidates with business suffixes (GmbH, SE, AG, etc.) over
    short brand/logo names (≤8 chars without suffix), e.g. "X XING" → "New Work SE".
  - `extractLabeledParty()` — Fallback: when a buyer label (e.g. "KUNDE:") has an invalid value
    (only numbers/IDs), checks the preceding line for a valid person/party name.
- **`installment-plan.ts`** — Tax installment plan and invoice number extraction.
  - `extractInvoiceNumber()` searches 30+ German/English labels (Rechnungsnummer, Rechnung #,
    Buchungscode, Buchungsnummer, Kassenbelegnummer, Auftrags-Nr, Transaktionsnummer, Unser Zeichen,
    Versicherung Nr, Gebrauchtfahrzeugrechnung, Invoice number, etc.).
    Uses global regex matching with next-line fallback: when the same-line value after a label is
    garbage (e.g. "Buchungscode (beim Check-In angeben)"), tries the next OCR line for a valid number.
    Separator regex allows dots, whitespace, colons, and newlines between label and value
    (handles OCR patterns like "Rechnungs-Nr .:\n512071761").
    Additional fallbacks: "Rechnung" + 5+ digits, `#` + 4+ digits (receipt printers),
    RE/RG/INV prefix patterns.
  - `normalizeInvoiceNumberCandidate()` rejects known label words (RECHNUNGSDATUM, DATUM, SEITE,
    ZIMMER, etc.) that OCR may capture as invoice number values. Tax-ID filter only rejects
    `DE` + 9-11 digits (USt-ID format), not pure-numeric invoice numbers.
- **`upsert-helpers.ts`** — Shared utility functions used by both the Edge Function
  (`process-document`) and Node.js backfill scripts:
  - `normalizeString()` — Trims whitespace, returns null for empty/non-string values.
  - `coerceDate()` — Parses ISO, DD.MM.YYYY, and YYYYMMDD date formats to `YYYY-MM-DD`.
    Validates month/day ranges and rejects dates more than 1 year in the future
    (prevents balance summary lines with invalid dates from creating phantom transactions).
  - `toNumber()` — Converts number/string values (handles German comma decimals).
  - `buildTransactionReference()` — Prefers dedicated reference field over description.

### Document type detection (`document-type-detection.ts`)

Classifies documents into `invoice`, `bank_statement`, or `receipt` using:
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

Anti-bank-statement signals include hotel/rental keywords and timesheet/payroll keywords
(`zeiterfassung`, `zeiterfassungsbogen`, `arbeitszeit-code`, `arbeitszeitnachweis`,
`stundennachweis`, `stundenuebersicht`). When >= 2 anti-statement keywords match,
bank_statement classification is suppressed.

Receipt detection uses keywords: `einzelkarte`, `fahrkarte`, `fahrschein`, `quittung`,
`kassenbon`, `kassenbeleg`, `kundenbeleg`, `reisekosten`, `ticket`, `online-ticket`,
`bitte entwerten`, `please validate`, `tankstelle`, `eur/liter`, `saeulen`, `parkhaus`,
`parkschein`, `parkzeit`, `parkdauer`, `parkgebuehr`, `kunden beleg`, `quittungsnummer`.
Requires >= 2 keyword hits for `receipt` classification.

**Default fallback:** When no type can be determined, documents default to `invoice`
(not `unknown`). Every uploaded document is either an invoice or receipt, making
`invoice` the safer fallback.

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
