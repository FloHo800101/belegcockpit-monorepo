# Klärungspunkte

Offene Fragen und Unklarheiten, die vor der Weiterentwicklung oder dem Produktivbetrieb geklärt werden müssen.

---

## [K-001] Hays-Rechnungen: Dokumenttyp und Matching-Richtung

**Status:** Offen
**Priorität:** Hoch (betrifft Matching-Korrektheit)

### Problem
Hays-Rechnungen wurden beim Upload als `INCOMING_INVOICE` klassifiziert. Das ist semantisch falsch:

- Der Nutzer ist Freiberufler und stellt Hays eine Rechnung für erbrachte Leistungen.
- Hays überweist dem Nutzer daraufhin Geld (Eingang auf dem Konto, `direction: "in"`).
- Aus Sicht des Nutzers sind das **Ausgangsrechnungen** (`OUTGOING_INVOICE`).

### Auswirkung auf das Matching
Die Matching Engine prüft in `prepass.ts → amountDirectionOk()`:
- `doc.amount >= 0` → erwartet `tx.direction = "out"` (Ausgabe)
- `doc.amount < 0` → erwartet `tx.direction = "in"` (Eingang)

Wenn Azure Document Intelligence den Betrag aus der Hays-Rechnung als **positiv** extrahiert, sucht die Engine nach einer Ausgabe – findet aber eine Einnahme. → **Kein Match möglich.**

### Zu klären
1. Welches Vorzeichen hat der extrahierte Betrag in der `invoices`-Tabelle für die Hays-Belege? (DB-Check ausstehend)
2. Soll `OUTGOING_INVOICE` als neuer Dokumenttyp eingeführt werden?
3. Oder: Wird das Vorzeichen beim Upload/Processing invertiert, wenn der Typ `OUTGOING_INVOICE` ist?
4. Alternativ: Trägt der Nutzer das Vorzeichen selbst ein (negative Beträge für Ausgangsr.)?

### Betroffene Dateien (bei Umsetzung)
- `packages/shared/src/domain/document.ts` – `DocumentType` um `"outgoing_invoice"` erweitern
- `backend/supabase/functions/_shared/processor.ts` – Vorzeichenlogik bei Extraktion
- `backend/supabase/functions/run-matching/index.ts` – ggf. Filterlogik nach Typ
- Frontend: Upload-UI – Typ-Auswahl anpassen

---

## [K-002] Multi-Beleg-Seite: Mehrere Quittungen auf einem DIN-A4-Blatt

**Status:** Offen
**Priorität:** Hoch (betrifft Vollständigkeit der Belegerfassung)

### Problem
Reisekostenbelege werden als gescannte DIN-A4-Seite hochgeladen, auf der physisch 2–3 Kleinbelege aufgeklebt/getackert sind (z.B. Taxi + U-Bahn-Tickets). Azure Document Intelligence erkennt zwar `ocrMultiReceipt: true`, erzeugt aber trotzdem nur **einen** Datensatz in der `invoices`-Tabelle – nicht einen pro Einzelbeleg.

**Beispiel:** `2302_Reisekosten_i.pdf` (Dateiname war fälschlich `2303_...`)
- Azure erkennt: Multi-Receipt mit 6 Positionen
- Erzeugt: 1 Invoice mit Gesamtbetrag 14,40 EUR (Wiener Linien)
- Erwartet: je 1 Invoice pro Beleg (Taxi + U-Bahn etc.)

**Weiteres Beispiel:** `2302_Reisekosten_ii.pdf`
- Azure extrahiert Vendor: Rashed GmbH (Taxi), Betrag: **55.006 EUR** ← offensichtlich falsch
- Vermutlich wurde eine Auftragsnummer (`5012/520 2/74 8322`) als Betrag interpretiert
- Tatsächlicher Betrag unbekannt (muss manuell geprüft werden)

### Zu klären
1. **Splitting-Logik:** Soll der `processor.ts` bei `ocrMultiReceipt: true` mehrere `invoices`-Einträge anlegen (einen pro `lineItem`-Gruppe / pro erkanntem Teilbeleg)?
2. **Fehlerbehandnis falscher Beträge:** Wie wird ein offensichtlich falscher Betrag (55.006 EUR für ein Taxi) erkannt und zur manuellen Korrektur markiert?
3. **Plausibilitätsprüfung:** Schwellenwert einführen (z.B. `RECEIPT` > 500 EUR → Warnung)?
4. **UX:** Wie sieht die manuelle Korrektur im Frontend aus (Betrag überschreiben, Beleg splitten)?

### Betroffene Dateien (bei Umsetzung)
- `backend/supabase/functions/_shared/processor.ts` – Multi-Receipt Splitting
- `backend/supabase/functions/process-document/index.ts` – Mehrfach-Insert in `invoices`
- Frontend: Korrektur-UI für geparste Belegdaten

---

## [K-003] Falscher Betrag bei Taxi-Beleg (Parsing-Fehler Azure)

**Status:** Offen – manueller Check erforderlich
**Priorität:** Mittel

### Problem
`2302_Reisekosten_ii.pdf` (Taxi, Rashed GmbH) wurde mit **55.006 EUR** in die `invoices`-Tabelle eingetragen. Dies ist eindeutig ein Parsing-Fehler – Azure hat vermutlich die Auftragsnummer `5012 /520 2/74 8322` als Betrag interpretiert.

### Sofortmaßnahme
Beleg manuell prüfen und den Betrag in der DB korrigieren (bis eine Korrektur-UI existiert).

### Strukturelle Maßnahme
→ Siehe K-002 (Plausibilitätsprüfung für auffällig hohe RECEIPT-Beträge)

---

## [K-004] UX: Belegstapel-Konzept – Monatsübergreifende Belege und beleglose Transaktionen

**Status:** Offen – Produktentscheidung erforderlich
**Priorität:** Hoch (betrifft grundlegendes Workflow-Verständnis des Mandanten)

### Problem
Der Belegstapel ist komplexer als der Bankstapel. Drei ungelöste Fälle:

**Fall 1 – Beleg vor Zahlung (periodenübergreifend)**
Ein Beleg aus Januar 2023 (z.B. Hotelrechnung) wird erst im Februar 2023 bezahlt.
→ Welchem Monat gehört der Beleg? Wo wird er angezeigt? Kann er „geparkt" werden?

**Fall 2 – Beleg ohne Banktransaktion**
Reisekosten bar bezahlt, Privatvorschuss, Eigenbeleg – es gibt keine passende Kontozeile.
→ Trotzdem vollständig: der Mandant hat einen Beleg, aber keine Transaktion.
→ Wie wird das abgeschlossen? Was sieht die SFA?

**Fall 3 – Transaktion ohne Beleg**
Abbuchung auf dem Konto, für die kein Papierbeleg existiert (z.B. Dauerauftrag, Gebühr).
→ Mandant muss einen Eigenbeleg erstellen oder die Buchung als „privat" markieren.

### Gewünschtes Ziel-Verhalten (vom Mandanten definiert)
1. **Für jede Transaktion** ist ein Beleg vorhanden – oder eine explizite Erklärung (Eigenbeleg, Privatbuchung, Dauerauftrag etc.)
2. **Für jeden Beleg** gilt eine von zwei Zuständen:
   - → Monat abgeschlossen: Beleg wurde **nachgereicht** (late submission)
   - → Monat offen / Zahlung in der Zukunft: Beleg wird **abgelegt** (geparkt für späteren Monat)

### Zu klären
1. Wie unterscheidet das System „Monat abgeschlossen" vs. „Zahlung noch ausstehend"?
2. Gibt es einen expliziten „Monat abschließen"-Workflow für den Mandanten?
3. Wie sieht der „Ablegen"-Flow aus – wird der Beleg einem konkreten Zukunftsmonat zugeordnet oder nur als „offen" markiert?
4. Wie sieht die SFA das: getrennte Listen für „nachgereicht" vs. „abgelegt"?

### Betroffene Bereiche (bei Umsetzung)
- Datenmodell: `documents`-Tabelle – neues Feld `assigned_month` oder `deferred_to_month`?
- Frontend: Workflow für „Beleg ablegen" / „Monat abschließen"
- Matching Engine: Monatsgrenzen bei der Suche berücksichtigen (ist bereits teilweise gelöst via `cross-period`)

---

## [K-005] UX: Schwachstellen im Mandanten-Workflow (deferred)

**Status:** Zurückgestellt – nach Klärung von K-004 angehen
**Priorität:** Mittel

### Identifizierte Schwachpunkte
- Fehlerhafte Parses (z.B. 55.006 EUR Taxi) sind für den Mandanten unsichtbar – keine Warnung
- Hays-Rechnungen semantisch falsch klassifiziert → Verwirrung im Review (→ K-001)
- Reisekosten-Sammelseite erzeugt einen statt mehrerer Datensätze (→ K-002)
- Feedback nach Upload unklar: Was wurde erkannt? Was ist fraglich?
- System kommuniziert in technischen Begriffen (`link_state`, `match_group_id`) statt in Mandantensprache

---

<!-- Neue Klärungspunkte oben einfügen, Format: ## [K-NNN] Titel -->
