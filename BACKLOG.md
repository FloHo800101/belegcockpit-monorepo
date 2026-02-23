# BelegCockpit – Backlog & Arbeitsstand

> Zuletzt aktualisiert: 2026-02-23

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

---

## Phase 0.2 – Backend-Anbindung (NÄCHSTES)

Ziel: PDF-Upload → Azure OCR → Matching → Ergebnis im Frontend – alles mit echten Daten.

### Schritt 1 – Migrationen deployen
- [ ] `supabase db push` → 17 bestehende Migrationen zum Live-Projekt pushen
- Zuständig: **Florian** (Supabase-Zugang)

### Schritt 2 – RLS-Policies
- [ ] Neue Migration: Row Level Security für alle relevanten Tabellen
  - `bank_transactions`: `tenant_id = auth.uid()`
  - `documents`: `tenant_id = auth.uid()`
  - `match_groups`, `match_edges_*`: über tenant_id
- Zuständig: **Tilov**

### Schritt 3 – `process-document` Edge Function deployen
- Die Funktion existiert bereits in `backend/supabase/functions/process-document/`
- [ ] Azure Document Intelligence Key als Supabase Secret setzen
- [ ] `supabase functions deploy process-document`
- Zuständig: **Florian** (Azure-Keys) + **Tilov** (Deploy)

### Schritt 4 – `run-matching` Edge Function bauen
- Die Funktion fehlt noch komplett
- Aufgabe: HTTP-Trigger → lädt Tx[] + Doc[] aus DB → ruft `run_pipeline()` → speichert Ergebnis
- **Kritisch:** Adapter-Layer `PipelineResult → ApiTxView[]` muss hier implementiert werden
  - `MatchDecision.state` + `confidence` → `TransactionStatus`
  - `TxLifecycleResult.kind` → `MandantPackageKey`
  - `MatchRelationType` → `KanzleiCluster`
- Zuständig: **Tilov**
- Input: `{ tenantId: string, monthId: string }`
- Output: `MatchingRunResult` (aus `packages/shared`)

### Schritt 5 – Frontend Upload-UI
- [ ] PDF-Upload-Komponente (Bankauszug + Belege)
- [ ] Upload → Supabase Storage → Trigger `process-document`
- [ ] Matching-Button → ruft `run-matching` auf
- [ ] Ergebnis anzeigen: `ApiTxView[]` als Transaktionsliste
- Zuständig: **Florian**

---

## Datenfluss-Übersicht

```
PDF-Upload (Frontend)
  ↓
Supabase Storage
  ↓
process-document (Edge Function) → Azure Document Intelligence → DB: documents / bank_transactions
  ↓
run-matching (Edge Function) [FEHLT NOCH]
  ├── lädt Tx[] + Doc[] aus DB
  ├── ruft run_pipeline()
  ├── speichert MatchDecisions → match_groups, match_edges_*
  └── berechnet ApiTxView[] → gibt MatchingRunResult zurück
  ↓
Frontend: zeigt ApiTxView[] an
```

### Bekannte Lücken (Gap-Analyse 2026-02-23)

| # | Lücke | Wo lösen |
|---|---|---|
| 1 | `run-matching` Edge Function fehlt | `backend/supabase/functions/run-matching/` |
| 2 | API-Adapter `PipelineResult → ApiTxView[]` fehlt | In `run-matching` |
| 3 | RLS Policies fehlen | Neue Migration |
| 4 | Frontend `Transaction.merchant` → API `counterpartyName` (Rename nötig) | Frontend |
| 5 | Frontend `Transaction.paymentMethod` → kein API-Gegenstück | Frontend anpassen |

### Was bereits passt ✅

- Engine-Typen (`Doc`, `Tx`) ↔ `packages/shared` Domain-Typen → **identisch**
- `ApiTx` / `ApiDoc` → vollständig definierter camelCase-Contract
- `ApiTxView` hat alle Felder die das Frontend braucht: `status`, `mandantPackageKey`, `kanzleiCluster`
- Alle Workflow-Typen in `packages/shared`: `TransactionStatus`, `MandantPackageKey`, `KanzleiCluster`, `SfaQueueId` → **vollständig**

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
