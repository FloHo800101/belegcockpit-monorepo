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

## Offene Aufgaben (Roadmap)
1. [ ] API Contract / Shared Data Model (Frontend ↔ Backend verbinden)
2. [ ] Authentifizierung (Supabase Auth ins Frontend integrieren)
3. [ ] Rollen & Berechtigungen (Mandant vs. Kanzlei)
4. [ ] Feature Entitlement (welche Features für welche Rolle/Plan)
5. [ ] Testautomatisierung (Frontend + Backend)

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
