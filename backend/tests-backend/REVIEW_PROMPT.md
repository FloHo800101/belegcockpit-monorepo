# Review-Extraction Workflow

## Kurzanweisung (Copy-Paste in Claude Code)

```
Extraction-Review fuer Tenant TENANT_ID_HIER.

Schritt 1 — Auto-Check (findet bekannte Fehlermuster):
cd backend && TENANT_ID=TENANT_ID_HIER deno run -A tests-backend/integration/review-extraction-auto.ts

Schritt 2 — Visuelle Pruefung der geflaggten Dokumente:
cd backend && TENANT_ID=TENANT_ID_HIER deno run -A tests-backend/integration/review-extraction.ts

Dann ALLE Dokumente visuell pruefen (Subagenten parallel, Batches a max 10):
- Agent liest PDF + _parsed.json
- Agent gibt 1-Zeilen-Befund zurueck
- Keine Stichprobe — jedes Dokument wird geprueft

Schritt 3 — Fixes:
Mapper-Bugs fixen, Tests schreiben, alle Tests laufen lassen.
Temp-Dateien loeschen, SESSION_LOG.md updaten.
```

## Workflow im Detail

### Phase 1: Auto-Check (kein Context-Verbrauch)

```bash
cd backend && TENANT_ID=xxx deno run -A tests-backend/integration/review-extraction-auto.ts
```

Prueft parsed_data auf 11 Regeln:
- buyerName ist Anrede (Herrn/Herr/Frau/Mr/Mrs/Ms)
- vendorName endet mit Komma/Semikolon
- vendorName zu kurz (<=2 Zeichen)
- totalGross > 50k bei Nicht-Kontoauszuegen
- totalNet > totalGross
- vatItems.rate > 1 (nicht normalisiert)
- invoiceDate in der Zukunft
- totalGross fehlt bei Invoice/Receipt
- vendorName fehlt
- invoiceDate fehlt
- buyerName == vendorName

Output: Liste der geflaggten Dokumente + Zusammenfassung.

### Phase 2: Visuelle Pruefung (Subagenten)

```bash
cd backend && TENANT_ID=xxx deno run -A tests-backend/integration/review-extraction.ts
```

Exportiert PDFs + parsed JSONs + raw JSONs nach `tests-backend/output/`.

**Pro Dokument** (ALLE, nicht nur geflaggte) einen Explore-Agent spawnen mit diesem Prompt:

```
Lies diese beiden Dateien und vergleiche sie:
1. PDF: tests-backend/output/FILENAME.pdf
2. Parsed: tests-backend/output/FILENAME_parsed.json

Pruefe: Stimmen vendorName, buyerName, invoiceNumber, invoiceDate,
totalGross, totalNet, totalVat, currency mit dem PDF ueberein?

Antworte in GENAU diesem Format (eine Zeile):
FILENAME | TYPE | OK oder BUG: Beschreibung | Ursache: Mapper oder Azure
```

**Wichtig:**
- ALLE Dokumente pruefen, nicht nur geflaggte
- Bei >10 Dokumenten: Batches abstimmen (User fragt vor jedem Batch)
- Agents parallel spawnen (max 5 gleichzeitig pro Batch)
- Raw JSON (_raw.json) NICHT lesen — nur bei bestatigtem Mapper-Bug

### Phase 3: Fixes + Cleanup

- Mapper-Code fixen wenn Bugs gefunden
- Tests schreiben fuer neue Faelle
- Alle Tests laufen lassen
- `tests-backend/output/` leeren
- SESSION_LOG.md updaten

## Skalierung

| Tenant-Groesse | Empfohlener Ansatz |
|---|---|
| ≤10 Dokumente | Auto-Check + alle visuell in einem Durchgang |
| 11-30 Dokumente | Auto-Check + alle visuell in Batches a 10 (User-Freigabe pro Batch) |
| 31-100 Dokumente | Auto-Check + alle visuell in Batches a 10 (User-Freigabe pro Batch) |
| >100 Dokumente | Auto-Check + alle visuell in Batches a 15-20 (User-Freigabe pro Batch) |

**Keine Stichproben** — jedes Dokument wird visuell geprueft, unabhaengig vom Auto-Check-Ergebnis.
