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
- **Status:** Aktuell mit Mock-Daten – Backend-Anbindung noch ausstehend

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

### 🟡 In Arbeit – Phase 0.2 Backend-Anbindung
- [ ] `process-document` Edge Function deployen (Azure DI Key benötigt)
- [ ] `run-matching` Edge Function bauen (PipelineResult → ApiTxView[] Adapter)
- [ ] Frontend Upload-UI (PDF → Storage → OCR → Matching → Anzeige)

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
