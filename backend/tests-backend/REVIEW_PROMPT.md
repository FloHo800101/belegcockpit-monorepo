# Review-Extraction Workflow

> **Dieser Workflow ist jetzt als Claude Code Skill verfuegbar.**
> Siehe: `.claude/skills/extraction-review.md`
>
> Claude Code erkennt den Skill automatisch anhand der Beschreibung
> (z.B. "Tenant X reviewen", "Extraction-Bugs analysieren", "parsed_data pruefen").
>
> Fuer manuelles Ausloesen: `/extraction-review` in Claude Code.

## Schnellstart (unveraendert)

```bash
# Auto-Check (alle Tenants):
cd backend && pnpm test:review-auto

# Auto-Check (spezifischer Tenant):
cd backend && TENANT_ID=<uuid> pnpm test:review-auto

# Visuelle Pruefung vorbereiten:
cd backend && TENANT_ID=<uuid> deno run -A tests-backend/integration/review-extraction.ts
```

Der vollstaendige 8-Phasen-Workflow (Auto-Check -> Visual Review -> Klassifizierung -> Fix -> Tests -> Re-Parse -> Backfill -> Redeploy) ist im Skill dokumentiert.
