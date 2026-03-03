# BelegCockpit – Projektkontext für Claude

## Ziel
Ein Monorepo mit Backend (Matching Engine) und Frontend (React App) für ein Buchhaltungs-Cockpit,
das Mandanten und Kanzleien bei der Verwaltung von Belegen, Transaktionen und Buchungsperioden unterstützt.

## Monorepo-Struktur

```
beleg-cockpit/
├── backend/      # Matching Engine, Supabase Edge Functions, Datenbankmigrationen
├── frontend/     # React 18 + Vite + Tailwind + shadcn/ui
├── package.json  # Monorepo-Root (pnpm workspaces)
└── pnpm-workspace.yaml
```

## Backend (`backend/`)
- **Paketmanager:** pnpm
- **Runtime:** Node.js (tsx) + Deno (für einige Integrationstests)
- **Kern:** `src/matching-engine/` – Matching-Logik (Dokumente ↔ Banktransaktionen)
- **Infrastruktur:** Supabase (PostgreSQL, Edge Functions, Storage)
- **Azure:** Azure Document Intelligence für PDF/XML-Extraktion
- **Tests:** `tests-backend/integration/` und `tests-backend/matching/`

## Frontend (`frontend/`)
- **Paketmanager:** pnpm (vorher bun, migriert)
- **Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router v6, TanStack Query
- **Architektur:** Feature-basiert (`mandant/`, `kanzlei/`, `shared/`)
- **Status:** Phase 0.3 abgeschlossen – alle Wizard-Screens laufen auf echten DB-Daten

## Rollen
- **Mandant:** Lädt Belege hoch, prüft Matches, übergibt an Kanzlei
- **Kanzlei:** Übersicht über alle Mandanten, Cluster-Arbeitsliste, Risiko-Queue

## Wichtige Routen (Frontend)
- `/mandant` – Dashboard, Monatsübersicht
- `/mandant/monat/:monthId/offene-punkte` – Cluster offener Punkte
- `/kanzlei` – Übersicht aller Mandanten
- `/kanzlei/mandant/:id/cluster/:clusterKey` – Cluster-Arbeitsliste

## Roadmap

### ✅ Abgeschlossen
- API Contract: `packages/shared/` (ApiTx, ApiDoc, ApiTxView, alle Workflow-Typen)
- Authentifizierung: Supabase Auth (Login, Register, Logout, AuthContext, ProtectedRoute)
- Deploy: GitHub Pages live (https://floho800101.github.io/belegcockpit-monorepo/)
- DB: 18 Migrationen deployed, RLS-Policies für alle Tabellen aktiv
- **Phase 0.2 Backend komplett** (Feb 24): Edge Functions deployed, Azure DI Secrets gesetzt
- **Phase 0.3 Frontend-Anbindung komplett** (Feb 25):
  - Upload-UI mit echten File-Inputs + Matching-Flow
  - `documentApi.ts`: `uploadDocument`, `processDocument`, `runMatching`, `loadMonthData`, `resolveTransaction`, `loadProcessedMonths`
  - `belegStore` LOAD_TRANSACTIONS: nach Matching echte Daten laden
  - `ClusterDetail`: Mandant-Entscheidungen in DB persistiert (`mandant_resolution`)
  - `UncertainMatches`: echte `matched_uncertain`-Transaktionen
  - `MandantDashboard`: Monate dynamisch aus DB
  - CORS-Fix + `onConflict`-Fix in Edge Functions

### 🟡 Nächstes – Phase 0.3 Deferred / Phase 1
- [ ] Frontend-Typen bereinigen (`Transaction.merchant` → `counterpartyName` etc.)
- [ ] Abschluss-Seite mit echter Monats-Zusammenfassung
- [ ] Kanzlei-Registrierung, Invite-Flow, Stripe

### ⏳ Phase 1 (nach Pilot)
- Kanzlei-Registrierung, Invite-Flow, Stripe
- RoleSwitcher durch echte Supabase-Rolle ersetzen

→ Vollständiges Backlog mit Details: BACKLOG.md

## Git-Workflow (in Diskussion)
- Strategie: GitHub Flow (Feature-Branches + PR in main)
- Branch-Naming: `frontend/<beschreibung>` / `backend/<beschreibung>`
- Commit-Konvention: Conventional Commits (`feat(frontend):`, `fix(backend):`, `chore:`)
- Branch Protection auf `main`: noch nicht aktiviert (in Entscheidung)
- 2 Entwickler: einer Frontend, einer Backend

## Team
- 2 Entwickler, beide VS Code
- GitHub: https://github.com/FloHo800101/belegcockpit-monorepo
- GitHub Pages: https://floho800101.github.io/belegcockpit-monorepo/

## Paketmanager
pnpm überall. Kommandos vom Root:
- `pnpm --filter frontend dev`
- `pnpm --filter backend test`

## Arbeitsregeln für Claude

### Backend-Änderungen → README aktualisieren
Bei **jeder** Änderung im Backend (`backend/`) MUSS `backend/tests-backend/README.md` geprüft und ggf. aktualisiert werden:
- Neue/geänderte Mapper, Parser oder Extraktions-Logik → Abschnitt "What each script does" ergänzen
- Neue Skripte/Befehle → in "Typical flow" und Befehlsliste aufnehmen
- Geänderte Architektur (neue Module, umbenannte Dateien) → Dokumentation anpassen

### Spezialisierte Subagenten (Tech. Team)
Für spezialisierte Aufgaben stehen vordefinierte Subagenten im Ordner `Tech. Team/` bereit (Übersicht: `Tech. Team/_Index.md`).
Claude soll bei passenden Aufgaben die jeweilige `.md`-Datei lesen und die Rolle als Subagent übernehmen.

**Für Belegcockpit relevante Agenten:**

| Agent | Rolle | Modell |
|---|---|---|
| **Black TypeScript** | TypeScript Senior Developer | Sonnet |
| **SuperBase** | Supabase Specialist | Sonnet |
| **React-or** | React Frontend Developer | Sonnet |
| **Orakel** | Kritischer Produktstratege | Opus |
| **Synapse** | AI/Prompt Engineer | Opus |
| **Flow** | UX/Onboarding Designer | Opus |
| **Testing Titan** | QA & Testing Specialist | Sonnet |

**Sinnvolle Kombinationen:**
- **Black TypeScript + React-or** → Backend + Frontend gleichzeitig
- **Synapse + SuperBase** → Prompt-Design + Edge Function gleichzeitig
- **Orakel alleine** → PRD-Review vor dem Bauen (immer zuerst)
- **Testing Titan nach jedem Feature** → Tests schreiben, Lücken finden, Bericht liefern

### Refactoring-Prüfung nach jeder Änderung
Nach Abschluss einer Backend- oder Frontend-Änderung MUSS eine kurze Refactoring-Prüfung durchgeführt werden:
- Gibt es duplizierte Logik, die konsolidiert werden kann?
- Gibt es toten Code (ungenutzte Exporte, verwaiste Importe)?
- Sind Funktionen zu lang oder zu komplex geworden (>50 Zeilen)?
- Stimmen Namenskonventionen noch (z.B. nach Umbenennung)?
- Ergebnisse als konkrete Vorschläge an den Benutzer melden (nicht selbstständig umsetzen)

### Session Summary pflegen
- Zu **Beginn** jeder Session MUSS `SESSION_LOG.md` gelesen werden, um den Kontext der letzten Arbeitsschritte zu kennen
- Am **Ende** jeder Session MUSS ein neuer Eintrag in `SESSION_LOG.md` geschrieben werden
- Neue Einträge werden **oben** angefügt (neueste zuerst)
- Format gemäß der Vorlage in der Datei (Datum, Agenten, Aufgaben, geänderte Dateien, Entscheidungen, Learnings, offene Punkte)
