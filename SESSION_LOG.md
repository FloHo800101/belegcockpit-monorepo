## Session – 2026-03-03 (8)

**Beteiligte Agenten:** Explore (6x parallel Batches à 2 Docs für Visual Review aller 50 Dokumente)

### Erledigte Aufgaben
- **REVIEW_PROMPT.md überarbeitet**: Sampling ("Stichprobe") komplett entfernt — ALLE Dokumente werden visuell geprüft, bei >10 Docs in Batches à max 10
- **Visual Review aller 50 Dokumente** über 4 Tenants durchgeführt (6 Explore-Batches parallel)
- **Ergebnis**: 15 OK (30%), 33 BUG (66%), 2 WARN (4%)

#### Fix 1: Detection-Keywords erweitert
- `document-type-detection.ts`: 7 neue Receipt-Keywords (`kundenbeleg`, `tankstelle`, `eur/liter`, `saeulen`, `parkhaus`, `parkdauer`, `parkgebuehr`) und 1 Tax-Notice-Keyword (`zahllast`)
- Behebt: 5 "unknown"-Dokumente (2 Tankbelege, 2 Parktickets, 1 Umsatzsteuer-Mail)

#### Fix 2: Date DD.MM→MM.DD Swap
- `receipt-mapper.ts`: `getDate()` → `resolvePreferredDate()` für alle 3 Code-Pfade (multi-doc, OCR-fallback, single-receipt)
- `azure-field-helpers.ts`: `resolvePreferredDate()` vereinfacht — bevorzugt IMMER DD.MM.YYYY Text-Parsing über Azure `valueDate`
- Behebt: 9 Datum-Vertauschungen (Azure parsed 05.06.2025 als 2025-06-05 statt 2025-05-06)

#### Fix 3: buyerName=Projektnummer (Hays)
- Analyse: Code bereits korrekt (`cleanPartyName` strippt Anreden). DB-Daten sind veraltet — Re-Parse behebt das Problem.

#### Fix 4: totalNet=null Fallback
- `receipt-mapper.ts`: `totalNet = roundCurrency(totalGross - totalVat)` wenn Azure kein `Subtotal` liefert
- `invoice-mapper.ts`: `totalNetFallback = roundCurrency(totalGross - totalTax)` wenn Azure kein `SubTotal` liefert
- Behebt: 8 Dokumente mit `totalNet: null`

#### Tests
- `azure-invoice-hotel.test.ts`: 5 neue Tests (4x resolvePreferredDate, 1x totalNet Fallback) → 18/18 bestanden
- `azure-receipt-multi.test.ts`: 4 neue Tests (Tankbeleg, HEM Tankbeleg, Parkticket, Umsatzsteuer) → 22/22 bestanden
- Gesamtergebnis: **40 Tests bestanden, 0 fehlgeschlagen**

#### Cleanup
- README.md aktualisiert (neue Keywords, Date-Fix, totalNet-Fallback Doku)
- Temp-Dateien gelöscht (`tests/output/`, `_query_tenants.ts`)

### Geänderte Dateien
- `backend/tests-backend/REVIEW_PROMPT.md` – Sampling entfernt, Batch-Workflow
- `backend/supabase/functions/_shared/document-type-detection.ts` – 8 neue Keywords
- `backend/supabase/functions/_shared/azure-mappers/azure-field-helpers.ts` – resolvePreferredDate vereinfacht
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – getDate→resolvePreferredDate + totalNet Fallback
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – totalNet Fallback + roundCurrency Import
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 5 neue Tests
- `backend/tests-backend/integration/azure-receipt-multi.test.ts` – 4 neue Tests
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begründungen
- `resolvePreferredDate` IMMER Text bevorzugen: Der alte 31-Tage-Threshold konnte nahe Swaps übersehen (05.06 vs 06.05 = 30 Tage). Einfacher und sicherer: Text-Parsing ist für DD.MM.YYYY immer korrekt
- totalNet-Fallback in beiden Mappern: Universelle Buchhaltungsregel `net = gross - vat` als Fallback wenn Azure SubTotal nicht liefert
- Tankstelle/Parkhaus-Keywords: Spezifisch genug, um keine False Positives zu erzeugen (min. 2 Hits für Receipt-Klassifizierung)
- `zahllast` als Tax-Notice-Keyword: Spezifisch für Umsatzsteuer-Bescheide

### Learnings
- Azure `valueDate` ist für deutsche DD.MM.YYYY-Formate unzuverlässig — immer Text-Parsing bevorzugen
- Receipt-Mapper nutzte `getDate()` (direkt Azure valueDate) statt `resolvePreferredDate()` (Text-First) — systematischer Check aller Mapper auf korrekte Date-Funktion empfohlen
- Tankbelege und Parktickets haben spezifische Vocabulare die als Receipt-Keywords gut funktionieren

### Offene Punkte / Nächste Schritte
- [ ] Re-Parse aller Tenants laufen lassen (behebt stale DB-Daten incl. Hays buyerName)
- [ ] Edge Function redeployen (damit neue Live-Dokumente alle Fixes bekommen)
- [ ] Prüfen ob weitere Mapper `getDate()` statt `resolvePreferredDate()` verwenden

---

## Session – 2026-03-03 (7)

**Beteiligte Agenten:** Explore (4x parallel: Invoice-Mapper-Analyse, Qonto-PDF, Apple-iCloud-PDF, Bewirtungsbeleg-PDF; 1x Stichprobe 3 OK-Docs; 1x Apple-iCloud-Raw-Analyse)

### Erledigte Aufgaben
- **Extraction-Review für alle Tenants** (außer `2567f217-...`, bereits in Session 6 geprüft)
- 4 Tenants identifiziert: `1ddff989` (38 Docs), `9b994e54` (1 Doc), `19dd1158` (1 Doc), `ec990ac9` (10 Docs) — insgesamt 50 Dokumente
- Auto-Check (11 Regeln) parallel für alle 4 Tenants ausgeführt
- 14 geflaggte Dokumente analysiert, 3 davon visuell mit Subagenten geprüft, Stichprobe 3 OK-Dokumente
- **vendorName-Bug gefixt**: `CustomerName` aus `vendorCandidates` in `invoice-mapper.ts` entfernt — verhindert dass Käufername als Vendor gesetzt wird wenn Azure keine Vendor-Felder liefert (Apple iCloud-Fall)
- 1 neuer Test: Apple-iCloud-Szenario (nur CustomerName, keine Vendor-Felder → vendorName ≠ buyerName)
- Alle 53 Tests grün
- README aktualisiert
- **Re-Parse + Backfill aller Tenants durchgeführt:**
  - `FORCE_REPARSE=1 pnpm test:azure-mappers` → 27 Analyze-Runs aktualisiert
  - `pnpm test:backfill-extractions` → 27 Extractions aktualisiert
  - Direkte Re-Parse von 54 Extractions ohne Analyze-Runs (Deno-Einmal-Script)
  - `pnpm test:backfill-invoices` → 54 Invoices aktualisiert
  - `pnpm test:backfill-bank-transactions` → 12 Bank-Transaktionen aktualisiert
- **Ergebnis nach Re-Parse:** Tenant `1ddff989` von 6→4 Flags, Tenant `ec990ac9` von 6→2 Flags (8 Findings behoben)
- Temp-Dateien in `tests-backend/output/` gelöscht

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – CustomerName aus vendorCandidates entfernt
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 1 neuer Test (Apple iCloud vendorName guard)
- `backend/tests-backend/README.md` – Test-Doku ergänzt
- `SESSION_LOG.md` – Neuer Eintrag
- DB: 54 Extractions + 54 Invoices + 12 Bank-Transaktionen + 27 Analyze-Runs aktualisiert

### Review-Ergebnisse (50 Dokumente, 4 Tenants)

| Tenant | Docs | OK | Flagged | Neue Bugs | Alte DB | Azure-Limit |
|---|---|---|---|---|---|---|
| `1ddff989` | 38 | 32 | 6 | 2 | 3 | 1 |
| `9b994e54` | 1 | 0 | 1 | 0 | 0 | 1 |
| `19dd1158` | 1 | 0 | 1 | 0 | 0 | 1 |
| `ec990ac9` | 10 | 4 | 6 | 0 | 6 | 0 |

**Neue Bugs gefunden & gefixt:**
| Dokument | Bug | Fix |
|---|---|---|
| Apple iCloud | vendorName=buyerName (CustomerName-Fallback) | CustomerName aus vendorCandidates entfernt |

**Neue Bugs gefunden (Azure-Limitation, kein Mapper-Fix):**
| Dokument | Bug | Ursache |
|---|---|---|
| Renault Leasing | totalGross=238€ (Monatsrate statt ~4500€), invoiceNumber fehlt | Komplexes Leasing-Dokument, Azure extrahiert nur Header |
| Qonto | buyerName="GmbH" (unvollständig) | Azure CustomerAddressRecipient unvollständig |
| Bewirtungsbeleg | buyerName="REPORT" (OCR-Rauschen) | Azure CustomerName extrahiert Footer-Text |

**Stichprobe OK-Dokumente:**
| Dokument | Ergebnis |
|---|---|
| ChatGPT Plus | OK — alle Felder korrekt |
| Microsoft 365 | OK — minimales Address-Rauschen |
| Renault Leasing | CRITICAL — Leasing-Struktur zu komplex für Azure |

### Entscheidungen & Begründungen
- `CustomerName` komplett entfernt statt `pickPrimaryParty`-Logik angepasst: Der Buyer-Name sollte konzeptionell nie als Vendor-Kandidat dienen. Besser vendorName=null als eine falsche Zuordnung
- Renault-Leasing nicht gefixt: Azure-prebuilt-invoice extrahiert bei mehrseitigen Leasing-Dokumenten nur die monatliche Rate aus dem Header. Ein OCR-basierter Totalbetrags-Fix wäre fehleranfällig
- Auto-Check `net_exceeds_gross` als False-Positive bei Gutschein-Rechnungen dokumentiert (Qonto: Subtotal vor Gutschein-Abzug)

### Learnings
- **CustomerName als Vendor-Fallback ist gefährlich**: Bei SaaS-Rechnungen (Apple, etc.) liefert Azure oft keine Vendor-Felder, nur CustomerName → Fallback setzt Buyer als Vendor
- **Stichproben finden Bugs die Auto-Check nicht sieht**: Renault-Leasing war "OK" im Auto-Check (Beträge vorhanden, kein Vergleich mit echtem Total möglich)
- **Alte DB-Werte dominieren bei Tenants die nicht re-parsed wurden**: 9 von 14 Findings in ec990ac9 + 1ddff989 sind bereits im Code gefixt, aber DB hat alte parsed_data

### Offene Punkte / Nächste Schritte
- [x] ~~Re-Parse laufen lassen~~ — erledigt (27 Analyze-Runs + 54 direkte Extractions)
- [x] ~~Temp-Dateien in `tests-backend/output/` löschen~~ — erledigt
- [ ] Edge Function redeployen (damit neue Live-Dokumente den Fix bekommen)
- [ ] Hays_1660691081_D.pdf: vatRate=19 verbleibt (Analyze-Run hat alten parsed_data, Re-Parse hat ihn nicht korrigiert)
- [ ] 54 Extractions ohne Analyze-Runs: `backfill-analyze-runs` kann sie nicht seeden (model_used fehlt?) → Ursache klären
- [ ] Optional: Renault-Leasing als bekannte Azure-Limitation in REVIEW_PROMPT.md dokumentieren
- [ ] Optional: Auto-Check-Regel `net_exceeds_gross` um Gutschein-Ausnahme erweitern

---

## Session – 2026-03-03 (6)

**Beteiligte Agenten:** Explore (1x buyerName-Code-Suche)

### Erledigte Aufgaben
- `review-extraction.ts` Script erstellt: lädt PDFs + raw_result + parsed_data pro Dokument lokal herunter für Dreifach-Vergleich (PDF → Azure-Rohdaten → Mapper-Output)
- 13 Dokumente des Tenants `2567f217-...` visuell reviewt (PDF lesen → parsed_data prüfen → bei Bedarf raw_result prüfen)
- **buyerName-Bug gefixt**: `cleanPartyName("Herrn")` gab `"Herrn"` zurück statt `null` — Regex `\s+` → `(?:\s+|$)` für Salutation-only Strings
- **vendorName trailing-comma gefixt**: `cleanPartyName` strippt jetzt trailing `,;:` — Receipt-Mapper leitet vendorName durch `cleanPartyName`
- vatItems.rate = 19 statt 0.19 analysiert: aktueller Code bereits korrekt (`parsePercent` /100), DB-Werte stammen von älterer Code-Version
- 3 neue Tests: salutation-only "Herrn", salutation-only "Herr", trailing comma
- `package.json`: Script `test:review-extraction` hinzugefügt
- `README.md`: review-extraction dokumentiert
- `review-extraction-auto.ts` erstellt: automatischer Plausibilitäts-Check (11 Regeln) auf parsed_data — findet bekannte Fehlermuster ohne PDFs zu lesen
- `REVIEW_PROMPT.md` erstellt: Copy-Paste-Workflow für künftige Reviews (Auto-Check → Subagenten → Fixes)
- `package.json`: Script `test:review-auto` hinzugefügt
- TS-Fehler in `review-extraction-auto.ts` gefixt: `ExtractionRow`-Interface statt `never`-Typ bei Supabase-Query

### Geänderte Dateien
- `backend/tests-backend/integration/review-extraction.ts` (NEU) – PDF/JSON-Export-Script
- `backend/tests-backend/integration/review-extraction-auto.ts` (NEU) – Automatischer Plausibilitäts-Check (11 Regeln)
- `backend/tests-backend/REVIEW_PROMPT.md` (NEU) – Workflow-Template für Reviews
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – Salutation-Regex-Fix + trailing punctuation
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – vendorName durch cleanPartyName
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 3 neue Tests
- `backend/package.json` – 2 neue Scripts (review-extraction, review-auto)
- `backend/tests-backend/README.md` – Doku

### Entscheidungen & Begründungen
- Regex `(?:\s+|$)` statt `\s*`: verhindert False Positives wie "Herr" in "Herrmann" (bei `\s*` würde "Herr" + 0 Spaces matchen)
- Trailing-Stripping nur `,;:` (nicht `.`): Punkte sind Teil von Abkürzungen ("e.K.", "Inc.", "Ltd.")
- vatItems.rate nicht gefixt: `parsePercent` dividiert bereits korrekt durch 100, ein Re-Parse würde DB-Werte korrigieren
- Review-Workflow in 2 Phasen: Auto-Check als Pre-Filter (0 Context-Verbrauch), dann Subagenten nur für geflaggte Dokumente (spart ~50% Context vs. alles manuell prüfen)

### Review-Ergebnisse (13 Dokumente)

| # | Dokument | Typ | Befunde |
|---|---|---|---|
| 1 | Flug_MUCHAM | invoice | totalNet/totalVat/invoiceNumber fehlen (Azure-Limitation) |
| 2 | Mercure Hotel | invoice | totalGross null (Azure), resolveInvoiceAmount greift |
| 3 | Hays DE | invoice | **buyerName="Herrn" → GEFIXT**, vatItems.rate=19 (alte DB) |
| 4 | MS_II | invoice | OK |
| 5 | FlugHAM_VIE | invoice | OK |
| 6 | MS_I | invoice | OK |
| 7 | DB Ticket | receipt | **vendorName trailing comma → GEFIXT**, MwSt falsch (Azure) |
| 8 | Kontoauszug | bank_statement | Transaktionen perfekt, bankName falsch (Azure) |
| 9 | Reisekosten_i | receipt | totalGross=55006 (Handschrift-OCR-Fehler) |
| 10 | Reisekosten_ii | receipt | OK (6 Tickets korrekt erkannt) |
| 11 | Hays AT | invoice | **buyerName="Herrn" → GEFIXT**, country="DE" statt "AT" (Azure) |
| 12 | T-Mobile/freenet | invoice | **buyerName="Herr" → GEFIXT**, alle Beträge korrekt |
| 13 | Mietwagen CHECK24 | invoice | totalNet/totalVat falsch (Versicherung statt Buchung, Azure) |

### Learnings
- Azure CustomerName enthält oft nur die Anrede ("Herrn"/"Herr") als separates Feld — der vollständige Name steht in CustomerAddressRecipient über mehrere Zeilen
- Receipt-Mapper hatte keinen Party-Name-Cleanup — vendorName kam direkt aus Azure ohne Bereinigung
- Handschriftliche Belege (Taxi-Quittungen) sind für Azure OCR problematisch: Dezimalkomma wird verschluckt

### Learnings (ergänzt)
- Manuelles PDF-Review skaliert nicht: 13 Dokumente × 3 Dateien sprengt das Context-Fenster
- Auto-Check als Pre-Filter spart ~50% visuelle Prüfung (6 von 13 OK, 7 geflaggt)
- Subagenten pro Dokument halten den Hauptkontext schlank (Agent gibt 1-Zeilen-Befund zurück)

### Offene Punkte / Nächste Schritte
- [ ] Re-Parse laufen lassen: `FORCE_REPARSE=1 pnpm test:azure-mappers` + Backfills → korrigiert alte DB-Werte
- [ ] Edge Function redeployen (für neue Live-Dokumente)
- [ ] Temp-Dateien in `tests-backend/output/` löschen nach Review
- [ ] Optional: bankName-Extraktion im Bank-Statement-Mapper verbessern
- [ ] Review-Workflow für weitere Tenants ausführen (Anleitung: `REVIEW_PROMPT.md`)

---

## Session – 2026-03-03 (5)

**Beteiligte Agenten:** Explore (3x parallel für Mapper-, Amount- und Processor-Analyse), Plan (1x für 3-Punkte-Fixplan)

### Erledigte Aufgaben
- Mercure Hotel-Rechnung: 3 fehlerhafte Felder (`amount: 0`, `invoice_no: null`, `buyer_name: null`) analysiert und gefixt
- `BUYER_LABELS` um "Gastname" und "Gast" erweitert (Hotel-Rechnungen)
- `cleanPartyName`: Anrede-Stripping (Herrn/Herr/Frau/Mr./Mrs./Ms.) hinzugefügt
- `extractInvoiceNumber`: Regex um `\\.?` nach Label erweitert (erlaubt "Rechnungsnr.")
- `resolveInvoiceAmount`: IEEE 754 Floating-Point-Bug gefixt (`roundCurrency` VOR Vergleich mit 0)
- `process-document/index.ts`: `resolveInvoiceAmount()` statt `parsed.totalGross ?? parsed.totalNet ?? null`
- `backfill-invoices.ts`: Lokale Duplikat-Funktion `resolveInvoiceAmount` entfernt, Import aus Shared-Modul
- 9 neue Deno-Tests für Hotel-Invoice-Extraction geschrieben, alle 49 Tests grün
- README mit Hotel-Invoice-Doku, FP-Fix, neuen Tests aktualisiert

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – BUYER_LABELS + Anrede-Stripping
- `backend/supabase/functions/_shared/azure-mappers/installment-plan.ts` – extractInvoiceNumber Regex-Fix
- `backend/supabase/functions/_shared/invoice-amount-candidates.ts` – FP-Bug in resolveInvoiceAmount
- `backend/supabase/functions/process-document/index.ts` – resolveInvoiceAmount Import + Nutzung
- `backend/tests-backend/integration/backfill-invoices.ts` – Lokale Duplikate entfernt, Shared-Import
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 9 neue Tests (NEU)
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begründungen
- `roundCurrency` VOR Vergleich: IEEE 754 erzeugt bei `[-401.76, +104.49, +104.49, +96.39, +96.39]` eine Summe von `2.842e-14` statt `0`. Ohne Rundung wird dieser Wert als "positiv" interpretiert → amount = 0
- Anrede-Stripping nur mit nachfolgendem Leerzeichen (`/^Herrn\s+/`): verhindert False Positives bei Firmennamen wie "Herrmann GmbH"
- Lokale Kopie in backfill-invoices.ts entfernt statt gefixt: Single Source of Truth im Shared-Modul, vermeidet künftige Divergenz

### Learnings
- **Duplikate von Shared-Code in Scripts sind ein häufiger Bug-Vektor** — backfill-invoices.ts hatte eine eigene `resolveInvoiceAmount`-Kopie ohne den FP-Fix
- IEEE 754 Floating-Point-Fehler bei Summenbildung: Die Additions-Reihenfolge bestimmt, ob ein FP-Fehler auftritt. Bestehender Test mit anderer Reihenfolge (positiv zuerst, negativ zuletzt) ergab exakt 0 → Bug blieb unentdeckt
- Hotel-Rechnungen (Mercure) haben spezifisches Format: "Gastname" statt "Kunde", "Rechnungsnr." mit Punkt, Payment-Zeile storniert die Summe

### Offene Punkte / Nächste Schritte
- [ ] Backfill erneut laufen lassen: `cd backend && pnpm test:backfill-invoices`
- [ ] Edge Function redeployen (für neue Live-Dokumente)
- [ ] Prüfen ob weitere Scripts lokale Kopien von Shared-Funktionen haben

---

## Session – 2026-03-03 (4)

**Beteiligte Agenten:** –

### Erledigte Aufgaben
- Sensible Datei `backend/Manueller Test/reparse-girokonto.mjs` in `.gitignore` aufgenommen
- Datei mit `git rm --cached` aus dem Git-Index entfernt (lokale Datei bleibt erhalten)

### Geänderte Dateien
- `.gitignore`
- `SESSION_LOG.md`
- `backend/Manueller Test/reparse-girokonto.mjs` (nur aus Index entfernt)

### Entscheidungen & Begründungen
- `.gitignore` allein reicht nicht für bereits getrackte Dateien; deshalb zusätzlich `git rm --cached`

### Learnings
- Pfade mit Leerzeichen werden in Git zuverlässig mit `-- "<pfad>"` adressiert

### Offene Punkte / Nächste Schritte
- [ ] Key in `backend/Manueller Test/reparse-girokonto.mjs` sofort rotieren, falls schon irgendwo geteilt

---
# Session Log – BelegCockpit Monorepo

Fortlaufendes Protokoll aller Arbeitssessions. Neue Einträge werden oben angefügt.

---

## Session – 2026-03-03 (3)

**Beteiligte Agenten:** Explore (2x parallel für Detection- und Mapper-Analyse), Plan (1x für Implementierungsdesign)

### Erledigte Aufgaben
- Receipt-Mapper: OCR-Datums-Fallback (`extractLatestDateFromOcr`) in allen 3 Pfaden implementiert (Fortsetzung aus Session 2)
- DB Online-Ticket (`2302_DB_WienRosenheim.pdf`): Document-Type-Detection und Amount-Parsing repariert
- Bank-Keyword `"buchung"` durch spezifische Begriffe ersetzt (`buchungstag`, `buchungstext`, `buchung / verwendungszweck`)
- Receipt-Keyword `"online-ticket"` hinzugefügt
- Sanity-Check im Receipt-Mapper: wenn Azure `Subtotal > Total` (vertauschte Felder), werden Werte getauscht
- 7 neue Deno-Tests geschrieben (3 Date-Fallback + 4 DB-Ticket), alle 36 Tests grün
- README aktualisiert mit Bank-Keyword-Doku und neuen Test-Beschreibungen

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – OCR-Datums-Fallback (3 Stellen) + Sanity-Check Total/Subtotal-Swap
- `backend/supabase/functions/_shared/document-type-detection.ts` – Spezifische Bank-Keywords + `online-ticket` Receipt-Keyword
- `backend/tests-backend/integration/azure-receipt-multi.test.ts` – 7 neue Tests (11 → 15 + 3 Date-Fallback davor)
- `backend/tests-backend/README.md` – Doku-Updates: Date-Fallback, Bank-Keywords, Test-Beschreibungen

### Entscheidungen & Begründungen
- `"buchung"` → spezifische Begriffe: "Buchung" ist zu generisch (bedeutet "Buchung/Reservierung" in vielen Kontexten). Bank-Statements verwenden Compounds wie "Buchungstag", "Buchungstext", "Buchung / Verwendungszweck"
- Sanity-Check statt OCR-Cross-Check: `totalNet > totalGross` ist eine universelle Buchhaltungsregel. OCR-Extraction für "Summe"-Zeile wäre komplexer und fehleranfällig
- `totalVat` nicht korrigiert: Azure hat nur MwSt 7% (1,56€) erkannt, nicht MwSt 19% (23,80€). Korrekte VAT-Dekomposition erfordert Tabellen-Parsing → separates Task
- `extractLatestDateFromOcr` gibt das jüngste Datum zurück: Bei Reisekosten = Ende der Reise, bei Einzelbeleg = Kaufdatum

### Learnings
- Azure `prebuilt-receipt` kann bei strukturierten Tabellen (Preis | MwSt 19% | MwSt 7%) die MwSt-Spalte als "Total" extrahieren statt den echten Gesamtbetrag
- Generische Keywords wie "Buchung" verursachen False Positives über Dokumenttyp-Grenzen hinweg
- `replace_all` in Edit-Tool matcht nur exakt gleiche Strings inkl. Indentation — verschiedene Einrückungstiefen werden nicht erfasst (Bug aus OCR-Date-Fallback)
- **Subagenten wurden eingesetzt:** 2x Explore + 1x Plan parallel → deutlich bessere Analyse und Planqualität

### Offene Punkte / Nächste Schritte
- [ ] VAT-Korrektur für Dokumente mit mehreren MwSt-Sätzen (DB-Ticket: 19% + 7%)
- [ ] Edge Function `process-document` mit DB-Ticket und Reisekostenbeleg live testen
- [ ] Prüfen ob weitere generische Keywords in der Detection Probleme verursachen

---

## Session – 2026-03-03 (2)

**Beteiligte Agenten:** Keine (Explore-Subagent für Codebase-Analyse). Hätten eingesetzt werden sollen: Black TypeScript, Testing Titan.

### Erledigte Aufgaben
- Analyse des Reisekostenbelegs `2303_Reisekosten_ii.pdf` (5 Wiener-Linien-Tickets á €2,40)
- Receipt-Mapper erweitert: Multi-Document-Support + OCR-Fallback für Multi-Receipt-Seiten
- Currency-Fix: OCR-basierte Erkennung (€ → EUR) hat Vorrang vor Azure-Feld (das falsch USD lieferte)
- Document-Type-Detection: 10 Receipt-Keywords hinzugefügt (Einzelkarte, Quittung, Reisekosten etc.)
- Processor: Receipt-Routing nach Detection (neuer `receipt`-Branch)
- 8 neue Deno-Tests geschrieben, alle 29 Tests (8 neu + 21 bestehend) grün
- README aktualisiert mit Receipt-Mapper-Doku und Detection-Abschnitt
- Claude Memory angelegt (`MEMORY.md`) mit Subagenten-Regel und Projekt-Patterns

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – Komplett erweitert: Multi-Document, OCR-Fallback, Currency-Fix
- `backend/supabase/functions/_shared/document-type-detection.ts` – Receipt-Keywords + Receipt-Return-Block
- `backend/supabase/functions/_shared/processor.ts` – Receipt-Routing nach Detection
- `backend/tests-backend/integration/azure-receipt-multi.test.ts` – Neue Testdatei (8 Tests)
- `backend/tests-backend/README.md` – Receipt-Mapper-Doku + Detection-Abschnitt + Data-Flow aktualisiert

### Entscheidungen & Begründungen
- OCR-Fallback statt neuer Dokumenttyp: Minimaler Eingriff, nutzt bereits vorhandenen OCR-Text
- Tax-Filter auf Position statt Zeile: `textBeforeMatch` statt `lowerLine` – verhindert dass Hauptbetrag auf Zeile mit Steuerbetrag gefiltert wird
- Receipt-Keywords >= 2 Treffer: Einzelner Treffer zu unspezifisch, 2+ gibt gute Confidence
- Receipt-Detection vor Invoice-Detection: Tickets enthalten "USt"/"Steuerbetrag" die sonst Invoice triggern

### Learnings
- Azure `prebuilt-receipt` erkennt nur EIN Receipt pro Seite – Multi-Receipt-Pages brauchen OCR-Fallback
- Azure kann Currency falsch erkennen (USD statt EUR obwohl € im Text) – OCR-Detection bevorzugen
- **Subagenten wurden NICHT eingesetzt, obwohl die Regel es vorsieht** → Muss in den Arbeitsablauf integriert werden: Nach Planungsphase explizit passenden Agent wählen

### Offene Punkte / Nächste Schritte
- [ ] Bei nächster Backend-Aufgabe: Black TypeScript als Subagent einsetzen
- [ ] Nach nächstem Feature: Testing Titan für Testabdeckungs-Review
- [ ] Edge Function `process-document` mit echtem Reisekostenbeleg testen (Live-Validierung)

---

## Session – 2026-03-03 (1)

**Beteiligte Agenten:** –

### Erledigte Aufgaben
- CLAUDE.md um Abschnitt "Spezialisierte Subagenten (Tech. Team)" erweitert – Tabelle mit 7 relevanten Agenten, Modell-Empfehlungen und sinnvollen Kombinationen
- CLAUDE.md um Arbeitsregel "Session Summary pflegen" erweitert – inkl. Pflicht, SESSION_LOG.md zu Beginn jeder Session zu lesen
- SESSION_LOG.md als fortlaufendes Session-Protokoll im Projekt-Root angelegt

### Geänderte Dateien
- `CLAUDE.md` – Drei Ergänzungen: Subagenten-Referenz (Zeile 94–114), Refactoring-Regel unverändert, Session-Summary-Regel (Zeile 124–128)
- `SESSION_LOG.md` – Neue Datei angelegt

### Entscheidungen & Begründungen
- Session Log als fortlaufende Einzeldatei (statt pro-Session-Dateien): Einfacher zu pflegen, alles an einem Ort
- Neueste Einträge oben: Schneller Zugriff auf aktuelle Informationen
- SESSION_LOG.md muss zu Beginn jeder Session gelesen werden: Sicherstellt Kontextkontinuität zwischen Sessions

### Learnings
- Das Tech. Team enthält 9 spezialisierte Subagenten mit klaren Rollen und Zuständigkeiten
- 7 davon sind für das Belegcockpit-Projekt relevant

### Offene Punkte / Nächste Schritte
- [ ] Keine offenen Punkte aus dieser Session

---

