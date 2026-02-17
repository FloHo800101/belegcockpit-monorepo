# Offline Mass Test Harness (Matching TX->DOC)

Zweck
- Offline Infrastruktur fuer spaetere Massentests der Matching Engine.
- Keine DB/Supabase, alles in-memory.
- Ausgabe fuer Analyse: JSON + HTML Report.

Kurz-Analyse (Entry-Point, Repo, Tools)
- Entry-Point: `src/matching-engine/pipeline.ts` (export via `src/matching-engine/index.ts`).
- Repo-Interface: `MatchRepository` in `src/matching-engine/types.ts`.
- Report-Tool: `tests-backend/matching/render-html-report.ts`.
- Referenz fuer Mapping/Normalisierung: `tests-backend/matching/live-replay.ts`.
- Engine-DTOs: `Doc`, `Tx`, `MatchDecision` in `src/matching-engine/types.ts`.

Dataset Format (v1)
```json
{
  "meta": { "name": "smoke", "tenant_id": "t1", "nowISO": "2026-01-12T21:03:00.000Z" },
  "docs": [ /* Doc DTOs */ ],
  "txs": [ /* Tx DTOs */ ],
  "configOverride": { /* optional MatchingConfig */ }
}
```
- Loader macht keine Normalisierung; Datasets muessen engine-ready sein.

Ausfuehren
- `pnpm matching:mass_tx2doc:offline`
- Optional: `pnpm matching:mass_tx2doc:offline:dataset -- --dataset <path> --out <dir>`

Output
- `out/latest/actual.json`
- `out/latest/summary.json`
- `out/latest/report.html`

Determinismus
- Runner verwendet keinen Random.
- Fuer reproduzierbare Timestamps `meta.nowISO` im Dataset setzen.
- Historie: setze `--out` auf einen timestamped Ordner, sonst wird `out/latest` ueberschrieben.

Summary (v1)
- Totals: docs/txs
- Counts nach match_state
- Top reason_codes
- Counts nach relation_type (aus doc_ids/tx_ids abgeleitet, falls noetig)

Ausblick
- XML Loader + Generator (spaeter, optional mit `--seed`).
- Expected/Compare Layer fuer CI (Mismatch -> Exit Code != 0).

Definition of Done (DoD)
- `pnpm matching:mass_tx2doc:offline` laeuft lokal ohne Supabase.
- Artefakte werden geschrieben: actual.json, summary.json, report.html.
- Strikte Typisierung und Wiederverwendung der Engine-Types.
- Keine Aenderungen am produktiven Matching-Code.
