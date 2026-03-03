# BelegCockpit – Technische Dokumentation und Funktionsübersicht

Stand: 26. Februar 2026  
Projekt: `belegcockpit-monorepo`

## 1. Ziel und Scope

BelegCockpit ist ein mandantenfähiges System zur **Beleg-Vollständigkeitsprüfung** mit Schwerpunkt auf:
- Upload und Verarbeitung von Dokumenten (Belege, Rechnungen, Kontoauszüge)
- Automatischem Matching von Belegen zu Banktransaktionen
- Geführtem Workflow für Mandanten (Monatsabschluss in Wizard-Form)
- Arbeitskorb- und Queue-basiertem Workflow für Kanzlei/SFA

Monorepo-Struktur:
- `frontend/`: React/Vite-Anwendung (Mandant + Kanzlei UI)
- `backend/`: Matching-Engine, Test-/Ops-Skripte, Supabase-Setup
- `packages/shared/`: gemeinsame Domain- und API-Typen

---

## 2. Systemarchitektur

## 2.1 Gesamtbild

Das System kombiniert:
- **Frontend (SPA):** React 18 + TypeScript + React Router
- **Backend-Logik:** Supabase Edge Functions (Deno) + TypeScript-Matching-Engine
- **Datenhaltung:** Supabase Postgres + Supabase Storage
- **Auth:** Supabase Auth

Kernfluss:
1. Dokument uploaden
2. OCR/Parsing via `process-document`
3. Strukturierte Daten persistieren (`invoices`, `bank_transactions`, etc.)
4. Matching-Lauf via `run-matching`
5. Ergebnisse im Mandant-/Kanzlei-Workflow bearbeiten

## 2.2 Monorepo und Build

Root-Skripte (`package.json`):
- `pnpm dev:frontend`
- `pnpm dev:backend`
- `pnpm build:frontend`
- `pnpm test:backend`

Backend-Skripte (`backend/package.json`) umfassen u. a.:
- Integrationstests
- Live-Replay-Matching
- Offline-Massentests für Matching-Szenarien
- Cleanup/Backfill-Skripte

---

## 3. Frontend (React/Vite)

## 3.1 Tech-Stack

- React 18
- TypeScript
- Vite
- React Router v6
- TanStack Query
- Tailwind CSS + shadcn/ui
- Supabase JS Client

## 3.2 Routing-Topologie

Zentrales Routing in `frontend/src/App.tsx`:
- Public:
  - `/login`
  - `/register`
- Protected:
  - `/` (Landing)
- Mandant:
  - `/mandant`
  - `/mandant/meine-daten`
  - Wizard:
    - `/mandant/monat/neu`
    - `/mandant/monat/:monthId/setup`
    - `/mandant/monat/:monthId/offene-punkte`
    - `/mandant/monat/:monthId/offene-punkte/:clusterId`
    - `/mandant/monat/:monthId/offene-punkte/review`
    - `/mandant/monat/:monthId/unsichere-matches`
    - `/mandant/monat/:monthId/abschluss`
  - Übergabe:
    - `/mandant/uebergabe/:monthId`
- Kanzlei:
  - `/kanzlei/mandanten-uebersicht`
  - `/kanzlei/arbeitskorb`
  - Legacy- und Workbench-Routen je Mandant/Monat/Cluster

## 3.3 Authentifizierung und Zugriffsschutz

- Supabase Auth in `AuthContext`
- `ProtectedRoute` blockiert alle geschützten Routen ohne Session
- Login/Register via `supabase.auth.signInWithPassword` / `signUp`

Benötigte Frontend-Umgebungsvariablen:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 3.4 State-Management

Zentraler UI-/Workflow-State über `BelegProvider` (`belegStore.tsx`):
- Transaktionen
- Dokumente
- Wizard-Status
- Abgeleitete KPIs und Counts
- Helper-Funktionen für Pakete, Cluster, Risk Queue

Hinweis: Der Store kombiniert Mock-/UI-Logik mit echten API-Ladevorgängen (`LOAD_TRANSACTIONS`).

---

## 4. Backend und Edge Functions

## 4.1 Kernkomponenten

1. **Dokumentverarbeitung**
- Edge Function: `supabase/functions/process-document/index.ts`
- Aufgaben:
  - Dokumentstatus setzen (`uploaded` -> `processing` -> `processed`/`failed`)
  - OCR/Parsing anstoßen (`processor.ts` + Azure-Mapping)
  - Ergebnisse in `document_extractions` persistieren
  - Upsert in `invoices`
  - Upsert in `invoice_line_items`
  - Für Kontoauszüge: Upsert in `bank_transactions`

2. **Matching-Lauf**
- Edge Function: `supabase/functions/run-matching/index.ts`
- Aufgaben:
  - Laden ungematchter Transaktionen/Belege eines Tenants
  - Ausführen der Matching-Pipeline
  - Persistenz von Match-Gruppen, Edges, Suggestions, Audit, Run-Metadaten
  - Rückgabe eines `MatchingRunResult`

3. **Test-Upload**
- Edge Function: `supabase/functions/test-document-upload/index.ts`
- Aufgaben:
  - Multipart-Upload
  - Hash-basierte Dublettenvermeidung
  - Speichern im Storage + `documents`
  - Optionaler Trigger von `process-document`

## 4.2 Matching Engine

Implementiert in:
- `backend/src/matching-engine/*`
- gespiegelt für Edge Runtime unter `backend/supabase/functions/_shared/matching-engine/*`

Pipeline (`run_pipeline`) in groben Schritten:
1. Tenant-/Limit-Filter
2. Partitionierung (`doc_tx`, `doc_only`, `tx_only`)
3. Lifecycle-Bewertung (Dokumente/Transaktionen)
4. Prepass-Hardmatches
5. Item-first-Phase
6. Relationserkennung (1:1, N:1, 1:N, N:N)
7. Matcher-Entscheidungen mit Confidence + Reason Codes
8. Konfliktauflösung
9. Persistenz:
   - Finale Matches anwenden
   - Suggestions speichern
   - Audit schreiben

Entscheidungszustände:
- `final`
- `suggested`
- `ambiguous`
- `partial`

Relationstypen:
- `one_to_one`
- `many_to_one`
- `one_to_many`
- `many_to_many`

## 4.3 Persistenz-Mapping

`toApplyOps` transformiert Match-Entscheidungen in Datenbank-Operationen:
- `upsert_edge`
- `upsert_group`
- `update_doc`
- `update_tx`
- `update_invoice_line_item`

Zusätzlich:
- Audit-Records über `toAuditRecord`
- Link-State-Ableitung aus Match-State

---

## 5. Datenmodell (Supabase/Postgres)

## 5.1 Relevante Tabellen

Upload/Parsing:
- `documents`
- `document_extractions`
- `document_analyze_runs`
- `document_xml_parse_runs`

Fachlich:
- `invoices`
- `invoice_line_items`
- `bank_transactions`

Matching:
- `match_groups`
- `match_edges_docs`
- `match_edges_txs`
- `matching_runs`
- `matching_audit`
- `matching_suggestions`
- `matching_applied_matches`

Mandantenkontext:
- `tenants`
- `memberships`

## 5.2 RLS und Mandantenisolation

RLS wird breit aktiviert (Migration `20260224090000_add_rls_policies.sql`):
- Isolation per `tenant_id`
- Hilfsfunktion `get_my_tenant_ids()` über `memberships`
- Frontend-Nutzer sehen nur eigene Tenant-Daten
- Edge Functions mit `service_role` umgehen RLS für Systemoperationen

## 5.3 Storage

Dokumente liegen im Bucket `documents`.
Pfadkonvention (sanitisiert):
- `tenant/<tenantId>/document/<documentId>/<filename>`

Mechanismen:
- Segment-Sanitizing gegen problematische Zeichen
- SHA-256-Hash für Dubletten-Erkennung
- Best-effort Cleanup bei DB-Insert-Fehlern nach Upload

---

## 6. Gemeinsame Typen (`packages/shared`)

`@beleg-cockpit/shared` enthält die vertraglichen Typen zwischen Frontend und Backend:
- Domain-Typen (`document`, `transaction`, `matching`)
- Workflow-Typen (`mandant`, `kanzlei`)
- API-Entities/Responses (`MatchingRunResult`, etc.)

Vorteil:
- Single Source of Truth für API-/Workflow-Verträge
- Reduktion von Drift zwischen UI und Edge Functions

---

## 7. Funktionsübersicht: Mandanten-Workflow

## 7.1 Monat starten / Setup

Im Wizard `MonthSetup`:
- Monat auswählen
- Upload von:
  - Kontoauszug
  - Kreditkartenabrechnung
  - Belegen
- Für jede Datei:
  - `uploadDocument()`
  - `processDocument()`

Anschließend:
- `runMatching(tenantId, monthId)`
- `loadMonthData()` lädt echte Daten aus DB in den Store

## 7.2 Offene Punkte

`OpenItems` gruppiert Aufgaben in Cluster (z. B. hohe Beträge, Bundles, Abos, Erstattungen).
Fokus:
- Priorisierung
- Fortschrittsanzeige
- Einstieg in `ClusterDetail`

## 7.3 Cluster-Detailbearbeitung

`ClusterDetail` nutzt Sidepanel-Interaktion:
- Tabellenzeile auswählen
- Aktionen im Inspector (uploaden, Eigenbeleg, ohne Beleg, Übergabe etc.)
- Auto-Advance zur nächsten offenen Transaktion
- Persistenz von Mandantenentscheidungen über `resolveTransaction()`

## 7.4 Unsichere Zuordnungen

`UncertainMatches` bietet kuratierte Review-Liste:
- bestätigen
- ablehnen
- übergeben

Sortierung priorisiert relevante Fälle (Betrag/Konfidenz).

## 7.5 Abschluss

`Completion`:
- Übergabe an Kanzlei
- Status-/Ergebnisdarstellung
- Historie/Trendanzeige im UI

---

## 8. Funktionsübersicht: Kanzlei/SFA-Workflow

## 8.1 Kanzlei-Layout

`KanzleiLayout` bietet:
- Seitennavigation (`Mandanten`, `Arbeitskorb`)
- Breadcrumbs
- Rückfragen-Kontext pro Mandant/Monat

## 8.2 Arbeitskorb

`Arbeitskorb` ist die zentrale SFA-Arbeitsliste mit:
- Suche
- Filterchips
- KPI-Filter (Überfällig, Offen >= Materialitätsschwelle, Unsicher, Wartend)
- Status-/Frist-/Summenlogik
- Schnellaktionen (z. B. Belege anfordern, Auto-Bestätigung)
- Event-basierte Sicht „Heute passiert“

## 8.3 Mandant-/Cluster-Workflows

Routen und Screens ermöglichen:
- Mandanten-Cockpit
- Cluster-Workbenches
- Rückfragenpakete
- Monatsabschlussverarbeitung

Typenseitig sind Cluster, Trigger, Status und KPI-Gruppen in `@beleg-cockpit/shared` normiert.

---

## 9. API- und Integrationsfluss

## 9.1 Frontend -> Supabase

Wichtige Frontend-API-Funktionen (`documentApi.ts`):
- `getMyTenantId()`
- `uploadDocument()`
- `processDocument()`
- `runMatching()`
- `loadMonthData()`
- `resolveTransaction()`
- `loadProcessedMonths()`

## 9.2 Matching-Ergebnis

`run-matching` antwortet mit `MatchingRunResult`:
- `tenantId`, `monthId`, `ranAt`
- `txCount`, `docCount`
- `finalMatches`, `suggestedMatches`
- `docLifecycle`, `txLifecycle`

## 9.3 Sicherheitstokens

Optionale Shared-Secrets für Edge Functions:
- `PROCESS_DOCUMENT_TOKEN`
- `TEST_DOCUMENT_UPLOAD_TOKEN`

Diese werden über Request-Header validiert.

---

## 10. Konfiguration und Umgebungsvariablen

## 10.1 Frontend

`.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 10.2 Backend / lokal

`.env`/lokale Dateien:
- `SUPABASE_LIVE_URL`
- `SUPABASE_LIVE_SERVICE_ROLE_KEY`
- `AZURE_DOCINT_ENDPOINT`
- `AZURE_DOCINT_KEY`
- `TEST_DOCUMENT_UPLOAD_TOKEN`
- `PROCESS_DOCUMENT_TOKEN`

## 10.3 Supabase CLI

`backend/supabase/config.toml` enthält lokale Ports und Runtime-Konfiguration:
- API: `54321`
- DB: `54322`
- Studio: `54323`
- Edge Runtime: Deno v2
- `verify_jwt = true` für `process-document` und `test-document-upload`

---

## 11. Tests und Betriebsprozesse

## 11.1 Tests

Backend:
- Integrationstests (`pnpm test:integration`)
- XML/PDF/Azure-Analyse-Falltests
- Offline-Massentests der Matching-Engine

## 11.2 Ops/Replay

- Live-Replay von Matching-Läufen
- Cleanup-Skripte für Runs und Datensätze
- Backfill-Skripte für Extraktionen, Transaktionen, Invoices, Hashes

---

## 12. Bekannte technische Besonderheiten

1. `run-matching` verwendet in der gezeigten Version zwei aufeinanderfolgende `.or(...)`-Filter auf derselben Query; das ist funktional kritisch und sollte bei Bedarf überprüft/abgesichert werden.
2. Im Frontend existiert weiterhin ein Mix aus Mock- und Live-Datenpfaden, insbesondere in Teilen des Wizard-/Kanzlei-Workflows.
3. Die Matching-Engine existiert doppelt (`backend/src` und `supabase/functions/_shared`), was Synchronisationsdisziplin erfordert.

---

## 13. Kurzfazit

BelegCockpit ist technisch als Supabase-zentrierte, mandantenfähige Workflow-Plattform aufgebaut. Die Kernstärken liegen in:
- klar getrennten Mandant-/Kanzlei-Prozessen,
- typisiertem Shared-Contract,
- modularer Matching-Engine mit Lifecycle- und Persistenzmodell,
- solider RLS-Isolation im Datenzugriff.

Für den weiteren Ausbau sind vor allem wichtig:
- weitere Entkopplung von Mock-Daten,
- Konsolidierung der Engine-Duplikate,
- stärkere API-Vertrags-Tests zwischen Frontend und Edge Functions.
