# BelegCockpit – Backlog & Arbeitsstand

> Zuletzt aktualisiert: 2026-02-25

---

## Aktueller Stand

### ✅ Abgeschlossen

| Bereich | Was | Wann |
|---|---|---|
| **Matching Engine** | `run_pipeline()` vollständig, 31/31 Tests grün | Feb 20 |
| **API Contract** | `packages/shared/` – alle Typen definiert (ApiTx, ApiDoc, ApiTxView, MatchingRunResult, …) | Feb 20 |
| **CI** | GitHub Actions: tsc + vitest auf PRs gegen main | Feb 23 |
| **Auth P0** | Supabase Auth ins Frontend: Login, Register, AuthContext, ProtectedRoute, Logout | Feb 23 |
| **Deploy** | GitHub Pages live: https://floho800101.github.io/belegcockpit-monorepo/ | Feb 23 |
| **Gap-Analyse** | Datenfluss DB → Engine → shared → Frontend vollständig analysiert | Feb 23 |
| **Migrationen** | 18 Migrationen bereits im Live-Projekt (waren schon deployed) | Feb 24 |
| **RLS** | Row Level Security für alle Tabellen deployed (`20260224090000_add_rls_policies.sql`) | Feb 24 |
| **process-document** | Edge Function deployed; Azure DI Secrets gesetzt | Feb 24 |
| **run-matching** | Edge Function deployed; Matching Engine als Deno-kompatible `_shared/`-Kopie | Feb 24 |
| **Storage RLS** | `documents`-Bucket abgesichert: nur eigener Tenant-Ordner (`20260224100000`) | Feb 24 |
| **Upload-UI** | `MonthSetup.tsx` mit echten File-Inputs, `documentApi.ts`, echte Matching-Ergebnisse | Feb 24 |
| **Phase 0.3 Rest** | OpenItems, ClusterDetail, UncertainMatches, MandantDashboard auf echte DB-Daten | Feb 25 |

---

## Phase 0.2 – Backend-Anbindung (ABGESCHLOSSEN ✅)

Ziel: PDF-Upload → Azure OCR → Matching → Ergebnis im Frontend – alles mit echten Daten.

### ✅ Schritt 1 – Migrationen deployen
- 18 Migrationen waren bereits im Live-Projekt vorhanden

### ✅ Schritt 2 – RLS-Policies
- Migration `20260224090000_add_rls_policies.sql` deployed
- Hilfsfunktion `get_my_tenant_ids()` über `memberships`-Tabelle
- Alle 13 Tabellen mit `tenant_id` abgesichert; system-Tabellen komplett gesperrt

### ✅ Schritt 3 – `process-document` Edge Function deployen
- Funktion existiert in `backend/supabase/functions/process-document/`
- Azure Document Intelligence Secrets gesetzt (`AZURE_DOCINT_ENDPOINT`, `AZURE_DOCINT_KEY`)
- `supabase functions deploy process-document` erfolgreich

### ✅ Schritt 4 – `run-matching` Edge Function
- `backend/supabase/functions/run-matching/index.ts` implementiert
- Matching Engine kopiert nach `_shared/matching-engine/` (Deno-kompatibel: `.ts`-Extensions)
- `SupabaseMatchRepository` implementiert `MatchRepository`-Interface
- Input: `{ tenantId, monthId }` → Output: `MatchingRunResult`
- `supabase functions deploy run-matching` erfolgreich

### ✅ Schritt 5 – Frontend Upload-UI
- Storage-RLS-Migration: `documents`-Bucket nur für eigenen Tenant zugänglich
- `frontend/src/lib/documentApi.ts`: `uploadDocument`, `processDocument`, `runMatching`, `toApiMonthId`
- `MonthSetup.tsx`: echte `<input type="file">` (PDF/CSV/Bilder, Mehrfachauswahl für Belege)
- Matching-Ergebnis zeigt echte Zahlen aus `MatchingRunResult` (finalMatches, txCount, suggestedMatches)
- tsc fehlerfrei, committed + gepusht auf main

### Phase 0.3 – Status (Feb 25)

#### ✅ Abgeschlossen
- `mandant_resolution`-Spalte in `bank_transactions` (Migration `20260224110000`)
- `documentApi.ts`: `loadMonthData`, `resolveTransaction`, `loadProcessedMonths`, `toFrontendMonthId`
- `belegStore`: `LOAD_TRANSACTIONS`-Action – nach Matching echte Daten laden
- `MonthSetup.tsx`: ruft nach `runMatching()` direkt `loadMonthData()` auf
- `MonthSetup.tsx`: dynamische Monatsliste (Jan 2020 bis heute)
- `ClusterDetail.tsx`: `resolveTransaction()` fire-and-forget bei allen Mandant-Entscheidungen
- `useWizardNavigation.ts`: dynamisches `monthLabel` (kein hardcodiertes `monthMap` mehr)
- `UncertainMatches.tsx`: echte `matched_uncertain`-Transaktionen statt Dummy-Daten
- `MandantDashboard.tsx`: Monate aus DB laden (`loadProcessedMonths`) – neuester Monat oben
- CORS-Fix in Edge Functions: `apikey` + `x-client-info` in `Access-Control-Allow-Headers`
- `process-document`: `onConflict: "id"` statt `"document_id"` (PK, kein Composite-Unique-Problem)

#### ⏳ Phase 0.3 – Noch offen (deferred)
- [ ] Frontend-Typen bereinigen (`Transaction.merchant` → `counterpartyName`, `paymentMethod` entfernen)
- [ ] Dashboard-Stats pro Monat (Transaktionsanzahl, Auto-Match-Quote) aus DB laden
- [ ] Abschluss-Seite: echte Zusammenfassung des verarbeiteten Monats

#### 🟡 Phase 0.4 – Nächste Schritte

**1. Multi-Upload & Upload-Feedback verbessern (Frontend)**
- [ ] Mehrere Kontoauszüge gleichzeitig hochladbar machen (MultiUpload)
- [ ] Erfolgsmeldung nach Kontoauszug-Upload: statt generischem "Kontoauszug importiert" → konkreten Dokumentnamen anzeigen (z.B. "Sparkasse_2026-01.pdf importiert")
- [ ] Erfolgsmeldung nach Beleg-Upload: Anzahl importierter Belege anzeigen + Mouseover/Tooltip mit Liste der einzelnen Dateinamen

**2. Frontend Activity Log**
- [ ] Log/Protokoll im Frontend bauen, das dem Benutzer transparent zeigt, was passiert ist (Upload, Verarbeitung, Matching-Ergebnis, Fehler etc.)

**3. Parsing-Qualität verbessern (Backend)**
- [ ] Verwendungszweck sauber aus Bank-Statements extrahieren (Azure-Mapper / `parse-utils`)
- [ ] Vendor / CounterPartyName korrekt aus Parsing-Ergebnis ableiten (`party-extraction`)

**4. Löschfunktion (Backend + Frontend)**
- [ ] Funktion zum Löschen aller Daten eines Monats / Mandanten
- [ ] Funktion zum Löschen einzelner Belege inkl. Auflösung bestehender Links/Matches (match_edges, match_groups)

---

## Datenfluss-Übersicht

```
PDF-Upload (Frontend)
  ↓
Supabase Storage
  ↓
process-document (Edge Function) ✅ → Azure Document Intelligence → DB: documents / bank_transactions
  ↓
run-matching (Edge Function) ✅
  ├── lädt Tx[] + Doc[] aus DB
  ├── ruft run_pipeline()
  ├── speichert MatchDecisions → match_groups, match_edges_*
  └── gibt MatchingRunResult zurück
  ↓
Frontend: zeigt echte Transaktionen + Cluster ✅
```

### Offene Lücken (nach Gap-Analyse 2026-02-23)

| # | Lücke | Status |
|---|---|---|
| 1 | `run-matching` Edge Function | ✅ Deployed |
| 2 | RLS Policies | ✅ Deployed |
| 3 | Frontend `Transaction.merchant` → API `counterpartyName` (Rename) | ⏳ Schritt 5 |
| 4 | Frontend `Transaction.paymentMethod` → kein API-Gegenstück | ⏳ Schritt 5 |

### Was bereits passt ✅

- Engine-Typen (`Doc`, `Tx`) ↔ `packages/shared` Domain-Typen → **identisch**
- `ApiTx` / `ApiDoc` → vollständig definierter camelCase-Contract
- `ApiTxView` hat alle Felder die das Frontend braucht: `status`, `mandantPackageKey`, `kanzleiCluster`
- Alle Workflow-Typen in `packages/shared`: `TransactionStatus`, `MandantPackageKey`, `KanzleiCluster`, `SfaQueueId` → **vollständig**

---

## Landingpage (parallel / low priority)

- [ ] Entscheidung: Lovable-Export übernehmen oder neu aufbauen
- [ ] Stack: Astro oder Vite+React; Deployment auf `belegcockpit.de` via Vercel
- [ ] Warteliste: E-Mail-Sammlung → Supabase `waitlist`-Tabelle oder Tally.so
- [ ] Impressum + Datenschutz (DSGVO-Pflicht)
- Verzeichnis: `landing/` im Monorepo

---

## Phase 1 (nach Pilot)

- [ ] Kanzlei-Registrierung + Mandant-Invite-Flow
- [ ] Stripe-Integration (Solo-Mandant + Kanzlei-Staffel)
- [ ] RoleSwitcher durch echte Supabase-Rolle ersetzen
- [ ] Resend für E-Mail-Bestätigung
- [ ] SFA-Workbench live

---

## Architektur-Entscheidungen

| Frage | Entscheidung |
|---|---|
| Auth-Plattform | Supabase Auth (EU-Daten) |
| E-Mail Phase 0 | Keine Bestätigung (deaktiviert); Phase 1: Resend |
| Mandant Phase 0 | Direkt-Registrierung ohne Kanzlei-Kontext |
| Matching-Ansatz | Regelbasierte Engine; LLM nur als Supplement (Konfidenz < 0.6) |
| Anzahlungen | Explizit aus Phase 0 ausgeschlossen |
| Vertragspartner | Kanzlei zahlt für ihre Mandanten; Solo-Mandant zahlt direkt |

---

## Qualitäts- & Vollständigkeitsanalyse (zu prüfende Punkte)

> Ergebnis der Analyse vom 2026-02-25: Abgleich Engine-Abdeckung vs. deutsches Steuerrecht + UX-Review.
> Status: **zu prüfen / einzuplanen** – noch keine Entscheidung getroffen.
> Backend/Engine-Punkte: Abstimmung mit TilovD erforderlich.
> Frontend/UX-Punkte: können unabhängig umgesetzt werden.

### Gesamtübersicht

| # | Thema | Beschreibung | Bereich | Empfehlung |
|---|---|---|---|---|
| 1 | **Steuerzahlungen erkennen** | USt-Vorauszahlung, ESt-Vorauszahlung, Gewerbesteuer ans Finanzamt werden heute als `missing_receipt` geflasst. Keyword-Erkennung ("Umsatzsteuer", "Finanzamt", "Steuervorauszahlung") + eigene Kategorie ohne Receipt-Pflicht. | Backend (Engine) + Frontend (UI-Kategorie) | Phase 1 |
| 2 | **Umbuchungen eigene Konten** | Transfers zwischen eigenen Geschäftskonten erzeugen falsche `missing_receipt`-Alarme. Keyword-Erkennung ("Umbuchung", "eigenes Konto") + automatische Kategorisierung. | Backend (Engine) | Phase 1 |
| 3 | **Skonto-Toleranz** | 2% Skonto (§ 17 UStG) auf große Beträge fällt durch aktuelle Toleranz (0,02 € / 0,1%). Toleranz auf ~3% anheben oder separate Skonto-Kategorie. Steuerlich: USt-Korrektur auf Bemessungsgrundlage. | Backend (Engine) | Phase 1 |
| 4 | **Rücklastschriften** | Zurückgebuchte Lastschriften erzeugen 2 Buchungen (Belastung + Rückbuchung). Heute beide als separate `missing_receipt`. Erkennung durch gegenläufige Beträge + Zeitfenster. | Backend (Engine) | Phase 1 |
| 5 | **Kleinunternehmer-Lieferanten §19 UStG** | Rechnungen ohne MwSt-Ausweis: Engine könnte Betragsabweichung signalisieren wenn sie Brutto/Netto vergleicht. Prüfen ob in der Praxis ein Problem entsteht. | Backend (Engine) | Phase 1 (prüfen) |
| 6 | **Re-Upload-Verhalten** | Was passiert mit manuell bestätigten Matches (`mandant_resolution`) wenn derselbe Monat erneut verarbeitet wird? Aktuell undefiniert. Regel definieren: mandant_resolution persistieren, match_edges neu berechnen. | Backend (Engine) + Frontend (UI-Flow) | Phase 1 |
| 7 | **Bewirtungsbelege §4 Abs. 5 Nr. 2 EStG** | Nur 70% abziehbar; Pflichtfelder fehlen oft im PDF (Anlass, Teilnehmer, Ort). Engine muss Restaurant-Kategorie erkennen, UI muss Pflichtfelder abfragen. Bereits als Phase 1 geplant. | Backend (Engine) + Frontend (UI) | Phase 1 |
| 8 | **Fahrzeugkosten / private Nutzung §6 Abs. 1 Nr. 4 EStG** | Tankstellen, KFZ-Reparaturen: Privatanteil muss herausgerechnet werden (1%-Methode oder Fahrtenbuch). Engine erkennt Tankstelle bereits – keine Aufteilung. UI müsste Privatanteil abfragen. | Backend (Engine) + Frontend (UI) | Phase 2 |
| 9 | **Barausgaben / Kassenbuch** | Engine matcht nur `bank_transactions ↔ documents`. Barausgaben (kein Bankbeleg, z.B. Baumaterial bar bezahlt) sind konzeptuell nicht modelliert. Scope-Entscheidung: Kassenbuch integrieren oder explizit ausschließen. | Backend (Modell-Entscheidung) + Frontend (UI) | Phase 2 (Scope-Entscheidung) |
| 10 | **AR-Matching (Ausgangsrechnungen)** | Kundenzahlungen (eingehende Überweisungen) vs. selbst erstellte Ausgangsrechnungen werden nicht gematcht. Für Freiberufler/Handwerker mit eigenem Rechnungswesen kritisch. Scope-Entscheidung. | Backend (Engine) + Frontend (UI) | Phase 2 (Scope-Entscheidung) |
| 11 | **Gutschrift §14 Abs. 2 UStG (Abrechnungsgutschrift)** | Auftraggeber stellt Rechnung aus (z.B. Plattformen, Verlage). Kein Matching-Problem, aber Label/Kategorie fehlt zur korrekten Zuordnung. | Backend (Engine) | Phase 2 |
| 12 | **CLUSTER_NN_WIZARD in UI abbilden** | `many_to_many + ambiguous`-Decisions (Periodenabgrenzung) haben keine dedizierte UI-Ansicht. Nutzer sehen diese nicht, können sie nicht auflösen. Eigene Ansicht "Komplexe Fälle" mit "An Kanzlei" als einziger Handlungsoption. | Frontend (UI) | Phase 1 |
| 13 | **Konfidenz-% durch Klartext ersetzen** | "87%" in UncertainMatches ist für Nicht-Experten bedeutungslos. Ersetzen durch verständliche Labels: "Betrag stimmt, Datum weicht 3 Tage ab" oder "Wahrscheinlich" / "Bitte prüfen". | Frontend (UI) | Phase 1 |
| 14 | **Erklärung "warum offen" pro Transaktion** | In OpenItems: Kurzer Hinweistext warum eine Tx offen ist ("Kein passender Beleg gefunden", "Betrag stimmt nicht überein"). Derzeit keine Erklärung sichtbar. | Frontend (UI) | Phase 1 |
| 15 | **Wizard: Hinweis auf offene Punkte vor "Weiter"** | Nutzer können Wizard abschließen ohne alle offenen Punkte geklärt zu haben. Sanfter Hinweis bei verbleibendem `gesamtCount > 0`: "Du hast noch X ungeklärte Positionen – trotzdem weiter?" | Frontend (UI) | Phase 1 |

### Zusammenfassung nach Bereich

**Backend (Engine) – Abstimmung mit TilovD erforderlich**
→ Punkte: #1 (anteilig), #2, #3, #4, #5, #6 (anteilig), #7 (anteilig), #8, #9, #10, #11

**Frontend (UI/UX) – unabhängig umsetzbar**
→ Punkte: #12, #13, #14, #15

**Beide Bereiche betreffen**
→ Punkte: #1, #6, #7, #8, #9, #10

---

## Steuerlich relevante Sonderfälle

### Phase 0 – Explizit ausgeschlossen

Diese Fälle werden in Phase 0 **nicht** abgedeckt. Die Engine markiert sie ggf. als `tax_risk`-Cluster, aber keine spezifische Verarbeitungslogik.

| Sonderfall | Warum komplex | Geplant für |
|---|---|---|
| **Reverse Charge** (§ 13b UStG) | Leistungsempfänger schuldet USt – kein USt-Ausweis auf Eingangsrechnung, aber Vorsteuer trotzdem abziehbar. Matching muss Auslandslieferant + Leistungsart erkennen. | Phase 1 |
| **Bewirtungsbelege** (§ 4 Abs. 5 Nr. 2 EStG) | Nur 70 % abziehbar; Pflichtangaben auf Bewirtungsbeleg (Anlass, Teilnehmer) fehlen oft im PDF. Extraktion und Validierung dieser Felder nötig. | Phase 1 |
| **Dauerschuldverhältnisse ohne Rechnung** (Miete, Leasing) | Regelmäßige Zahlung ohne zugehöriges Dokument ist steuerlich legitim – aber das Matching-System würde sie fälschlicherweise als `missing_receipt` klassifizieren. | Phase 1 |
| **Anzahlungen / Abschlagsrechnungen** | 1 Tx entspricht einer Teilrechnung; finale Rechnung folgt später. Cross-period, partielle Beträge, Zuordnung komplex. | Phase 1 |
| **Innergemeinschaftlicher Erwerb** (§ 1a UStG) | Ähnlich Reverse Charge, aber für Warenbezug aus EU. Erfordert USt-IdNr.-Prüfung. | Phase 2 |
| **Gutschriften / Storno** (kreditorisch) | Negative Rechnungen; Matching gegen ursprüngliche Rechnung + ggf. Teilgutschrift. | Phase 1 |

### Phase 0 – Behandlung im System

Alle oben genannten Fälle, die trotzdem als Transaktion auftauchen:
- Werden vom Matching-Engine ggf. als `tax_risk` oder `anomaly` klassifiziert
- Erhalten `NextAction: "ask_user"` oder `"inbox_task"`
- Landen in der **Mandanten-Review-Queue** (`mandantPackageKey: "review"`)
- Die SFA kann in Phase 1 gezielt darauf reagieren

---

## Wichtige Links

- **Repo:** https://github.com/FloHo800101/belegcockpit-monorepo
- **Frontend live:** https://floho800101.github.io/belegcockpit-monorepo/
- **Supabase Projekt:** https://svrvdxrwyxiyepukdmrl.supabase.co
- **API Contract:** `packages/shared/src/` (single source of truth für alle Typen)

---

## Git-Workflow

- Branch-Naming: `frontend/<beschreibung>` / `backend/<beschreibung>`
- Commit-Konvention: Conventional Commits (`feat(backend):`, `fix(frontend):`, `chore:`)
- PRs gegen `main` → CI muss grün sein (tsc + vitest)
- **Tilov:** arbeitet auf `backend/<feature>`-Branches, PR → Review → merge

