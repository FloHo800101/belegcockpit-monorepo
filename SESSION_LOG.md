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

