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

### Refactoring-Prüfung nach jeder Änderung
Nach Abschluss einer Backend- oder Frontend-Änderung MUSS eine kurze Refactoring-Prüfung durchgeführt werden:
- Gibt es duplizierte Logik, die konsolidiert werden kann?
- Gibt es toten Code (ungenutzte Exporte, verwaiste Importe)?
- Sind Funktionen zu lang oder zu komplex geworden (>50 Zeilen)?
- Stimmen Namenskonventionen noch (z.B. nach Umbenennung)?
- Ergebnisse als konkrete Vorschläge an den Benutzer melden (nicht selbstständig umsetzen)

---

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for any non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After any correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

---

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections
