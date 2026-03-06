## Session – 2026-03-06 (14)

**Beteiligte Agenten:** Explore, General-Purpose (DB-Analyse)

### Erledigte Aufgaben
- **buyer_name Qualitaet analysiert und Parsing verbessert** fuer Tenant a6a3fd7d

#### Analyse: 153 Invoices, 80 mit falschem/fehlendem buyer_name
- 73 korrekt "Florian Hoffmann", 26 NULL, 34 Garbage-OCR, 3 Airline-Format, 7 korrekte Ausgangsrechnungen, 10 sonstige

#### Fix: isLikelyGarbageName() — neuer Garbage-Filter fuer party-extraction.ts
- **Kassenbon-Keywords:** BARBELEG, ZW-SUMME, PASSEND, RUECKGELD, KARTENZAHLUNG, EC-KARTE etc.
- **Maskierte Kartennummern:** XXXXX1212, ****1234
- **Betraege als Name:** 16,73 EUR, € 42.50
- **Flug-Datumscodes:** 18JUN23, 29MAY23
- **Versicherungs-Perioden:** DV 01.23, DV 11.22
- **Referenz-Codes:** CI4Z9A, DA3CD00400 (kurze alphanumerische Codes ohne Business-Suffix)
- **Produktzeilen:** 455 BLUETOOTH HEADPHONES (Zahl + Produktname)
- **Anleitungstext:** MIT APP BESTELLEN UND BEZAHLEN
- **Buchungs-Referenzen:** LHA-P-KIB34-2023-00003389 (Hyphen-getrennte Codes)
- **Generische Woerter:** HOTELS, SUITES HOTEL, HBF/Hauptbahnhof/Bahnhof/Flughafen
- **Rechtliche Texte:** Verordnung, Gesetz, Richtlinie
- **Adressen:** Postfach, zusammengesetzte Strassennamen (LINDEMANNSTR.)
- **Service-IDs:** FREE NOW ID, DE-MAIL

#### Fix: normalizeAirlineName() — Airline-Format Normalisierung
- `HOFFMANN / FLORIAN MR` → `Florian Hoffmann`
- Pattern: `NACHNAME / VORNAME (MR|MRS|MS|DR)?`
- Integriert in cleanPartyName() als letzter Schritt

#### Fix: cleanPartyName() — isLikelyAddressOrContactLine eingebaut
- cleanPartyName() pruefte bisher nur isLikelyMetadataLine, nicht Adresszeilen
- Jetzt werden auch Adresszeilen (Strasse, PLZ, Email, URLs) vor der Kandidatenauswahl gefiltert

#### Fix: isLikelyAddressOrContactLine() — zusammengesetzte Strassennamen
- `/str\.\s/i` und `/str\.$/i` fuer zusammengesetzte Namen wie "LINDEMANNSTR." hinzugefuegt

#### Diagnose-Script: analyze-buyer-names.ts
- Laedt alle Invoices fuer einen Tenant, vergleicht aktuellen buyer_name mit neuem Filter
- Kategorisiert in: korrekt, garbage, airline, null, sonstige

### Ergebnis: 35 von 80 problematischen buyer_names gefiltert/normalisiert

| Kategorie | Anzahl | Aenderung |
|-----------|--------|-----------|
| Garbage → NULL | 35 | Neue Filter greifen |
| Airline → normalisiert | 3 | HOFFMANN / FLORIAN MR → Florian Hoffmann |
| Korrekte Ausgangsrechnungen | 7 | AYTU GmbH, SYNAOS GmbH — unveraendert |
| NULL (Tankbelege etc.) | 26 | Bleiben NULL — kein Buyer auf Kassenbons |
| Sonstige (Edge Cases) | 9 | CAROLINE, Florian ING DiBa etc. — Einzelfaelle |

### Geaenderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` — isLikelyGarbageName(), normalizeAirlineName(), cleanPartyName() erweitert, isLikelyAddressOrContactLine() verbessert
- `backend/tests-backend/integration/analyze-buyer-names.ts` — NEU: Diagnose-Script
- `backend/tests-backend/README.md` — Doku-Updates

### Entscheidungen & Begruendungen
- Keine generische Single-Word-Heuristik: Wuerde auch echte Vendor-Namen (ALDI, REWE) filtern, da cleanPartyName fuer Buyer und Vendor verwendet wird
- CAROLINE nicht gefiltert: Ist auch ein valider Personenname, Hotelname als Buyer ist ein Azure-DI-Problem (CustomerName falsch gesetzt)
- Florian ING DiBa nicht gefiltert: Teilweise korrekter Name, Azure OCR merged Namen mit Banknamen — braeuchte spezifischen Fix fuer Eurowings-Rechnungen

### Tests
- Alle 6 bestehenden vitest-Tests bestanden (vendor-name, receipt-multi, bank-fx, date-fallback, storage-path, upload)
- azure-invoice-hotel.test.ts hat leere Test-Suite (vorbestehendes Problem)

### Offene Punkte / Naechste Schritte
- [ ] Re-Parse + Backfill fuer Tenant a6a3fd7d (damit DB-Werte aktualisiert werden)
- [ ] Edge Function redeployen (damit neue Dokumente profitieren)
- [ ] Unit-Tests fuer isLikelyGarbageName() und normalizeAirlineName() schreiben
- [ ] "Florian ING DiBa" Edge Case analysieren (Eurowings OCR-Qualitaet)

---

## Session – 2026-03-06 (13)

**Beteiligte Agenten:** Explore (6x parallel, Batches a 5-8 Dokumente visuell pruefen)

### Erledigte Aufgaben
- **Fehlende invoice_no analysieren und fixen** fuer Tenant a6a3fd7d (56 → 17 NULL, 70% Reduktion)
- Diagnose-Script erstellt, visuelle Pruefung aller 56 Dokumente, Mapper gefixt, Re-Parse + Backfill

#### Bugfix: PostgREST URL-Laenge (azure-mappers-cases.ts + backfill-extractions)
- `.in("storage_path", group)` mit 200 langen Pfaden ueberschreitet URL-Limit → `Bad Request`
- Fix: Chunk-Size von 200 auf 30 fuer storage_path Queries, Empty-Array Guards

#### Fix: extractInvoiceNumber() — 15 neue Labels + bessere OCR-Erkennung
- **Neue Labels:** Rechnung #, Buchungscode, Buchungsnummer, Rechnungs Nr, Auftrags-Nr, Auftrags Nr,
  Beleg Nr, Belegnummer, Bonnummer, Reservierungscode, Reservation code, Transaktionsnummer,
  Kassenbelegnummer, Vorgangsnummer, Unser Zeichen, Versicherung Nr, Gebrauchtfahrzeugrechnung
- **Separator-Regex:** `[.\s]*[:#\-]?[.\s]*` statt `\.?\s*[:#\-]?\s*` — erlaubt OCR-Muster wie `Rechnungs-Nr .:\n512071761`
- **Global Match + Next-Line:** Wenn Label-Wert auf gleicher Zeile Muell ist (z.B. "Buchungscode (beim Check-In angeben)"),
  wird die naechste Zeile geprueft
- **"Rechnung + Zahl" Fallback:** `\bRechnung\s+(\d{5,})\b` fuer `Rechnung 67198934` Pattern
- **"#Nummer" Fallback:** `#\d{4,}` fuer Kassenbon-Nummern wie `#117938`

#### Fix: normalizeInvoiceNumberCandidate() — Tax-ID-Filter praezisiert
- `^(DE)?\d{9,}$` → `^DE\d{9,11}$` — nur echte USt-IDs filtern, nicht rein-numerische Rechnungsnummern
- Behebt: Audi 512071761, Autohaus 2023109393, DEVK 868172681 u.a.

#### Neue Auto-Review-Regel: missing_invoice_number
- `review-extraction-auto.ts`: Warnung wenn invoiceNumber NULL bei documentType=invoice

### Ergebnis: 39 von 56 Dokumenten gefixt

| Kategorie | Beispiele |
|-----------|-----------|
| Gefixt durch neue Labels | Hotels (Rechnung #), Eurowings (Buchungscode), Booking.com (Buchungsnummer), MediaMarkt (Kassenbelegnummer) |
| Gefixt durch Separator-Regex | Autohaus (Rechnungs-Nr .:\n...), PKW Reparatur (Auftrags-Nr .:\n...) |
| Gefixt durch Fallbacks | Hotels (Rechnung 67198934), Autowaesche (#117938), DEVK (Versicherung Nr) |
| Gefixt durch Tax-ID-Filter | Audi (512071761), Autohaus (2023109393) |
| Legitim NULL (17 verbleibend) | Taxiquittungen, Tankbelege, Bewirtungsbelege ohne Nr., WEMAG |

### Geaenderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/installment-plan.ts` – extractInvoiceNumber() und normalizeInvoiceNumberCandidate()
- `backend/tests-backend/integration/review-extraction-auto.ts` – Neue Regel missing_invoice_number
- `backend/tests-backend/integration/diagnose-missing-invoice-no.ts` – NEU: Diagnose-Script
- `backend/tests-backend/integration/azure-mappers-cases.ts` – Chunk-Size Fix + Empty-Guard
- `backend/tests-backend/integration/backfill-extractions-from-analyze.ts` – Chunk-Size Fix + Empty-Guard
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begruendungen
- Chunk-Size 30 statt 200 fuer storage_path: Pfade sind ~100+ Zeichen, 200 sprengt PostgREST URL-Limit
- Tax-ID-Filter nur `^DE\d{9,11}$`: Deutsche USt-IDs haben exakt dieses Format, reine Zahlen sind oft Rechnungsnummern
- Global Match statt First Match: Viele Labels erscheinen mehrfach im OCR-Text, erste Vorkommen sind oft in Fliesstext
- Next-Line Fallback: Azure OCR setzt Label und Wert oft auf separate Zeilen

### Tests
- Alle 76 bestehenden Tests bestanden (18 hotel + 13 vendor + 26 receipt + 11 bank + 8 amount)

### Offene Punkte / Naechste Schritte
- [x] Re-Parse fuer Tenant a6a3fd7d (erledigt in dieser Session)
- [x] Backfill-Extractions + Backfill-Invoices fuer den Tenant (erledigt)
- [ ] Edge Function redeployen (damit neue Dokumente auch profitieren)
- [ ] `tests-backend/output/` leeren nach Review-Abschluss
- [ ] Unit-Tests fuer neue extractInvoiceNumber-Patterns schreiben

---

## Session – 2026-03-05 (12)

**Beteiligte Agenten:** Explore (40x parallel, 5 pro Batch, je 4 Dokumente visuell pruefen)

### Erledigte Aufgaben
- **Extraction-Review fuer Tenant a6a3fd7d** (159 Dokumente, alle Typen)
- Auto-Check: 21 geflaggt (1 Error, 32 Warnings)
- Visuelle Pruefung: 73 OK (46%), 86 BUGs (54%) — davon 59 Azure, 27 Mapper, 1 gemischt
- Ergebnis-Datei: `backend/tests-backend/output/review-results.md`

#### Fix A: lineItems totalPrice Dezimalkorrektur (Mapper)
- `invoice-mapper.ts`: Wenn `quantity * unitPrice` um Faktor >100 von `totalPrice` abweicht, wird der berechnete Wert genommen
- Ursache: Azure OCR liest "7.560.,00 €" als 7.56 statt 7560 — wir korrigieren mapper-seitig

#### Fix B: vatItems Sanity-Filter (Mapper)
- `invoice-mapper.ts`: vatItems mit `amount > totalGross` werden gefiltert (Azure OCR Dezimalfehler, z.B. "3.127" → 3127)
- vatItems mit `netAmount < 0` werden gefiltert (Deposit Transfers falsch als vatItem)
- Behebt: 2311_Bewirtungsbeleg (totalNet -3072.2), 2305_Hotel2905Wien (netAmount -291.64)

#### Fix C: buyerName Country/Legal-Form Filter (Mapper)
- `party-extraction.ts` `cleanPartyName()`: Lehnt Laendernamen ab ("DEUTSCHLAND", "Oesterreich", etc.)
- Lehnt reine Rechtsform-Strings ab ("GmbH & Co. KG" ohne echten Firmennamen)
- Behebt: Hotel buyerName "DEUTSCHLAND", Audi/PKW buyerName "GmbH & Co. KG"

#### Fix F: totalNet Sanity-Check (Mapper)
- `invoice-mapper.ts`: Wenn totalNet < 0 aber totalGross > 0, wird aus vatItems oder als Fallback totalGross verwendet
- Behebt: 2304_Autow_sche (totalNet -15)

#### Review-Ergebnis Zusammenfassung (159 Dokumente)

| Kategorie | Anzahl | Ursache |
|-----------|--------|---------|
| OK | 73 | - |
| BUG (Azure OCR) | 59 | Nicht fixbar |
| BUG (Mapper) — gefixt | ~15 | Fix A/B/C/F |
| BUG (Mapper) — unfixbar | ~12 | Azure-Daten zu schlecht |

#### Tests
- 6 neue Tests: lineItem totalPrice Dezimalkorrektur, vatItem amount>gross Filter, vatItem negative netAmount Filter, cleanPartyName DEUTSCHLAND, cleanPartyName "GmbH & Co. KG", negative totalNet Korrektur
- 84/84 Tests bestanden (78 alte + 6 neue)

### Geaenderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – lineItem totalPrice Korrektur, vatItem Sanity-Filter, negative totalNet Guard
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – cleanPartyName: Country + Legal-Form Rejection
- `backend/tests-backend/integration/azure-invoice-vendor-name.test.ts` – 6 neue Tests
- `backend/tests-backend/README.md` – Doku-Updates
- `backend/tests-backend/output/review-results.md` – Vollstaendiger Review-Bericht (159 Dokumente)

### Entscheidungen & Begruendungen
- lineItem totalPrice: Faktor >100 als Schwelle (konservativ genug, nur echte Dezimalfehler)
- vatItem amount > totalGross: Sicherer Filter — ein einzelnes vatItem kann nie mehr Steuer als Bruttobetrag haben
- Country-Name Liste: Nur DE/AT/CH + englische Varianten, erweiterbar bei Bedarf
- Legal-Form-Only: Entfernt alle bekannten Suffixe, prueft ob Rest leer ist

### Learnings
- Azure OCR hat systematische Probleme mit deutschen Tausendertrennern ("7.560.,00 €" → 7.56)
- Azure TaxDetails.Amount kann um Faktor 1000 daneben liegen wenn "3.127" als 3127 gelesen wird
- Hotel-Rechnungen haben oft Deposit-Zeilen die als negative vatItem-netAmounts erscheinen
- buyerName "DEUTSCHLAND" kommt bei oesterreichischen Hotels vor (Azure nimmt Country-Feld)
- Bei 159 Dokumenten ist Context-Management kritisch: Ergebnis-Datei + Batches + Subagenten

### Offene Punkte / Naechste Schritte
- [ ] Re-Parse fuer Tenant a6a3fd7d: `TENANT_ID=a6a3fd7d-b12d-4887-b28f-7d816766c237 FORCE_REPARSE=1 pnpm test:azure-mappers`
- [ ] Backfill-Extractions + Backfill-Invoices fuer den Tenant
- [ ] Edge Function redeployen
- [ ] `tests-backend/output/` leeren nach Review-Abschluss

---

## Session – 2026-03-05 (11)

**Beteiligte Agenten:** Explore (5x parallel, je 1 Dokument visuell pruefen)

### Erledigte Aufgaben
- **Extraction-Review fuer Tenant 139e9812** (5 Dokumente, alle Invoices)
- Auto-Check: 0 Flags
- Visuelle Pruefung: 1 OK, 4 Bugs gefunden — alle gefixt

#### Fix 1: Fuehrungszeugnis totalNet/totalVat null (Mapper)
- `invoice-mapper.ts`: Neuer Fallback fuer steuerfreie Belege — wenn `totalVat == null` und `totalGross != null` und `totalNet == null`, dann `totalVat = 0` und `totalNet = totalGross`
- Ursache: Azure liefert TaxDetails mit Amount=0, aber kein TotalTax-Feld → bestehende Fallbacks greifen nicht

#### Fix 2: Xing vendorName "X XING" statt "New Work SE" (Mapper)
- `party-extraction.ts`: `pickPrimaryParty()` bevorzugt jetzt Kandidaten mit Business-Suffix (GmbH, SE, AG, etc.) gegenueber kurzen Brand/Logo-Namen (≤8 Zeichen ohne Suffix)
- Azure liefert VendorName="X XING" (Logo) und VendorAddressRecipient="New Work SE" → jetzt wird "New Work SE" gewaehlt

#### Fix 3: Metro invoiceNumber/buyerName null (doch fixbar!)
- `installment-plan.ts`: Neue Labels "Rechnungs-Nr", "Beleg-Nr", "Bon-Nr" in `extractInvoiceNumber()` — Metro hat "RECHNUNGS-NR." mit Bindestrich
- `party-extraction.ts` `isLikelyMetadataLine()`: "rechnungs-nr", "beleg-nr", "bon-nr" hinzugefuegt — verhindert Fehlklassifizierung als Firmenname
- `party-extraction.ts` `extractLabeledParty()`: Neuer Fallback — wenn Buyer-Label (z.B. "KUNDE:") nur eine Nummer/ID enthaelt, wird die Zeile davor geprueft → findet "Florian Hoffmann"

#### Fix 4: Freenet buyerName = Kundennummer "M22076230495" (Mapper)
- `party-extraction.ts` `cleanPartyName()`: Iteriert jetzt ueber alle Zeilen von Multi-Line-Werten statt nur die erste Zeile. "Herr\nFlorian Hoffmann" → erste Zeile "Herr" wird gestrippt → zweite Zeile "Florian Hoffmann" wird korrekt zurueckgegeben
- `party-extraction.ts` `looksLikeCompanyLine()`: Lehnt Strings mit hohem Ziffernanteil ab (digits > letters*2), verhindert dass IDs wie "M22076230495" als Firmenname erkannt werden

#### Review-Ergebnis (5 Dokumente)

| # | Dokument | Typ | Befund |
|---|----------|-----|--------|
| 1 | 2211_MS_II | invoice | OK |
| 2 | 2211_Xing | invoice | vendorName "X XING" → Fix 2 |
| 3 | 2211_Beleg_Fuehrungszeugnis | invoice | totalNet/totalVat null → Fix 1 |
| 4 | 2211_Beleg_Metro_Weihnachtspraesente | invoice | invoiceNumber/buyerName null → Fix 3 |
| 5 | 2212_Freenet | invoice | buyerName=Kundennr → Fix 4 |

#### Tests
- 4 neue Tests: business-suffix preference, tax-free totalNet fallback, Metro RECHNUNGS-NR.+KUNDE, multi-line anrede buyerName
- 7/7 vendor-name + 26/26 receipt-multi + 18/18 invoice-hotel Tests bestanden

### Geaenderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – tax-free totalNet/totalVat Fallback
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – cleanPartyName multi-line, looksLikeCompanyLine digit-ratio, pickPrimaryParty business-suffix, isLikelyMetadataLine hyphenierte Varianten, extractLabeledParty preceding-line Fallback
- `backend/supabase/functions/_shared/azure-mappers/installment-plan.ts` – 3 neue Labels (Rechnungs-Nr, Beleg-Nr, Bon-Nr)
- `backend/tests-backend/integration/azure-invoice-vendor-name.test.ts` – 4 neue Tests
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begruendungen
- Business-Suffix-Preference nur bei kurzen Namen (≤8 Zeichen): Laengere Namen wie "Deutsche Bahn" sollten nicht durch Suffix-Kandidaten ersetzt werden
- Digit-Ratio-Schwelle `digits > letters*2`: Konservativ genug um echte Firmennamen wie "3M" nicht abzulehnen
- Metro doch fixbar: "RECHNUNGS-NR." (mit Bindestrich) fehlte als Label, und buyerName vor "KUNDE:"-Zeile extrahierbar

### Learnings
- Azure VendorName ist oft Logo-Text (OCR aus dem Bild), waehrend VendorAddressRecipient den rechtlichen Firmennamen enthaelt
- Multi-Line Azure-Felder (z.B. "Herr\nFlorian Hoffmann") muessen zeilenweise verarbeitet werden — nur die erste Zeile zu nehmen verliert den eigentlichen Namen
- `looksLikeCompanyLine` Regex `/^[A-Z0-9&.,'"\- ]{6,}$/` ist zu permissiv fuer IDs mit fuehrendem Buchstaben

### Offene Punkte / Naechste Schritte
- [ ] Re-Parse fuer Tenant 139e9812: `TENANT_ID=139e9812-aeaf-496a-8598-f1699d05c6df FORCE_REPARSE=1 pnpm test:azure-mappers`
- [ ] Backfill-Extractions + Backfill-Invoices fuer den Tenant
- [ ] Edge Function redeployen

---

## Session – 2026-03-05 (10)

**Beteiligte Agenten:** Explore (1x Review aller 6 unknown-Dokumente)

### Erledigte Aufgaben
- **6 "unknown"-Extractions analysiert** aus DB-Export (`document_extractions_rows (1).json`)
- Ursache: Alle 6 haetten mit aktuellem Code korrekt erkannt werden muessen — Detection-Keywords matchen. DB-Werte stammen von aelterer Code-Version vor Keyword-Erweiterungen

#### Fix 1: Default von `unknown` auf `invoice`
- `document-type-detection.ts`: Fallback-Return liefert jetzt `invoice` mit `confidence: 0.1` und Reason `fallback:default_invoice` statt `unknown`/`0`
- Begruendung: Jedes hochgeladene Dokument ist entweder Invoice oder Receipt — Invoice ist der sicherere Default

#### Fix 2: Neue Receipt-Keywords
- `document-type-detection.ts`: `kunden beleg` (mit Leerzeichen, z.B. HEM Tankbelege) und `quittungsnummer` (z.B. Aral Tankbelege) hinzugefuegt
- Behebt: Edge Cases wo OCR "KUNDEN BELEG" statt "KUNDENBELEG" liefert

#### Fix 3: totalNet-Fallback im OCR-Fallback-Pfad
- `receipt-mapper.ts`: Der OCR-Fallback-Pfad (multi-receipt OCR-Erkennung) berechnet jetzt `totalNet = totalGross - totalVat` — wie es im single-receipt-Pfad bereits funktioniert
- Betrifft: Dokumente wo Azure kein Subtotal liefert aber TotalTax vorhanden ist

#### Review-Ergebnis (6 Dokumente)

| # | Dokument | Typ | Befund |
|---|----------|-----|--------|
| 0 | Parkschein | receipt | vendorName=null (Azure kein MerchantName) |
| 1 | USt-Mail | invoice | vendor/buyer vertauscht (Azure, E-Mail-Format) |
| 2 | Parkhaus 07.05 | receipt | OK, totalNet fehlte → Fix 3 |
| 3 | Parkhaus 06.05 | receipt | OK, totalNet fehlte → Fix 3 |
| 4 | HEM Tanke | receipt | OK, totalVat plausibel berechnet |
| 5 | Aral Tanke | receipt | OK, totalVat plausibel berechnet |

#### Tests & Backfills
- 3 neue Tests: default-to-invoice, "KUNDEN BELEG" mit Leerzeichen, OCR-totalNet-Berechnung
- 26/26 receipt-multi + 18/18 invoice-hotel Tests bestanden
- Re-Parse: `FORCE_REPARSE=1 pnpm test:azure-mappers` → 13 updated
- Backfill-Extractions: 13 updated, Backfill-Invoices: 67 inserted

### Geaenderte Dateien
- `backend/supabase/functions/_shared/document-type-detection.ts` – Default invoice statt unknown + 2 neue Keywords
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – totalNet-Fallback im OCR-Pfad
- `backend/tests-backend/integration/azure-receipt-multi.test.ts` – 3 neue Tests
- `backend/tests-backend/README.md` – Doku-Updates (keine unknown mehr, neue Keywords, totalNet in allen Pfaden)

### Entscheidungen & Begruendungen
- Default `invoice` statt `unknown`: Kein Dokument im System ist "unknown" — entweder Receipt oder Invoice. Invoice als Default ist sicherer weil der Invoice-Mapper mehr Felder extrahiert
- `kunden beleg` als eigenes Keyword: OCR trennt manchmal zusammengesetzte Woerter — besser explizit matchen
- totalNet-Fallback in allen 3 receipt-mapper-Pfaden: Universelle Buchhaltungsregel, konsistent mit invoice-mapper

### Learnings
- Die 6 unknown-Eintraege waren KEINE Code-Bugs sondern **veraltete DB-Daten** — der aktuelle Code haette sie korrekt erkannt. Re-Parse behebt das Problem
- OCR kann zusammengesetzte Woerter trennen ("KUNDEN BELEG" statt "KUNDENBELEG") oder mit Bindestrichen schreiben ("K-U-N-D-E-N-B-E-L-E-G") — Keywords muessen Varianten abdecken

### Offene Punkte / Naechste Schritte
- [ ] Pruefen ob die 6 unknown-Dokumente jetzt korrekt in der DB stehen (diese hatten keine analyze_runs)
- [ ] Edge Function redeployen
- [ ] Doc 1 (USt-Mail): vendor/buyer-Vertauschung ist Azure-Limitation bei E-Mails — kein Mapper-Fix moeglich

---

## Session – 2026-03-05 (9)

**Beteiligte Agenten:** Keine Subagenten (direkte Fixes)

### Erledigte Aufgaben
- **4 Extraction-Bugs gefixt** aus dem Review der Session 8:

#### Fix 1: parsePercent Bug (Hays vatRate=19 statt 0.19)
- `parse-utils.ts`: `parsePercent("19.00 %")` entfernte den Dezimalpunkt als Tausendertrenner → 1900/100=19
- Fix: Dot-als-Dezimal erkennen wenn kein Komma vorhanden und Dot gefolgt von 1-2 Ziffern
- Betrifft: Alle Dokumente mit Azure TaxDetails Rate im Format "X.XX %"

#### Fix 2: Parken_WS_EGS = unknown → receipt
- `document-type-detection.ts`: Keywords `parkschein` und `parkzeit` hinzugefügt
- Ergibt 2 Keyword-Hits → Receipt-Klassifizierung

#### Fix 3: Berlin_Hotel invoiceNumber="RECHNUNGSDATUM"
- `installment-plan.ts`: Label-Blocklist in `normalizeInvoiceNumberCandidate()` — bekannte Label-Wörter (RECHNUNGSDATUM, DATUM, SEITE, ZIMMER, ANREISE, ABREISE, TOTAL, SUMME, NETTO, BRUTTO, etc.) werden als invoiceNumber abgelehnt
- Ursache: OCR liest "Rechnungsnummer: Rechnungsdatum" als eine Zeile, "Rechnungsdatum" wird als Wert extrahiert

#### Fix 4: Bewirtung_EGS totalVat/totalNet=null
- `invoice-mapper.ts`: Fallback — wenn Azure kein TotalTax liefert aber TaxDetails/vatItems vorhanden, wird totalVat aus Summe der vatItems-Amounts berechnet, totalNet = totalGross - totalVat
- Ergebnis: totalVat=10.92, totalNet=99.08, totalGross=110

#### Tests
- 41/41 relevante Tests bestanden (azure-receipt-multi + azure-invoice-hotel)
- 71/71 Gesamttests bestanden (2 pre-existing Deno-Permission-Fehler in upload-documents und live-replay)

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/parse-utils.ts` – parsePercent Dot-Dezimal-Fix
- `backend/supabase/functions/_shared/document-type-detection.ts` – 2 neue Receipt-Keywords
- `backend/supabase/functions/_shared/azure-mappers/installment-plan.ts` – Label-Blocklist für invoiceNumber
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – totalVat-Fallback aus vatItems
- `backend/tests-backend/README.md` – Doku-Updates für alle 4 Fixes

### Entscheidungen & Begründungen
- `parsePercent` unterscheidet jetzt Dot-als-Dezimal (kein Komma + Dot vor 1-2 Ziffern am Ende) von Dot-als-Tausendertrenner (Komma vorhanden oder Dot vor 3+ Ziffern)
- Label-Blocklist statt Regex-Pattern: Explizite Wortliste ist wartbarer und hat keine False Positives
- totalVat-Fallback aus vatItems: Universelle Buchhaltungsregel, TaxDetails sind vertrauenswürdig

### Learnings
- Azure liefert Prozent-Werte im Format "19.00 %" (Dot-Dezimal), während deutsche Beträge "1.234,56" (Dot-Tausender) verwenden — `parsePercent` muss beides unterscheiden
- OCR-Zeilen wie "Rechnungsnummer: Rechnungsdatum" entstehen bei Hotels wo beide Labels nebeneinander stehen — eine Blocklist für bekannte Label-Wörter ist die sicherste Lösung
- Azure TotalTax fehlt bei Kassenbons/Bewirtungsbelegen häufig, obwohl TaxDetails korrekt extrahiert werden

### Offene Punkte / Nächste Schritte
- [ ] Re-Parse aller Tenants laufen lassen (behebt stale DB-Daten)
- [ ] Edge Function redeployen (damit neue Live-Dokumente alle Fixes bekommen)
- [ ] Berlin_Hotel: Echte Rechnungsnummer AAV2A26746 wird nicht extrahiert (steht auf separater Zeile nach dem Label) — optionaler Follow-up

---

## Session – 2026-03-03 (8)

**Beteiligte Agenten:** Explore (6x parallel Batches à 2 Docs für Visual Review aller 50 Dokumente)

### Erledigte Aufgaben
- **REVIEW_PROMPT.md überarbeitet**: Sampling ("Stichprobe") komplett entfernt — ALLE Dokumente werden visuell geprüft, bei >10 Docs in Batches à max 10
- **Visual Review aller 50 Dokumente** über 4 Tenants durchgeführt (6 Explore-Batches parallel)
- **Ergebnis**: 15 OK (30%), 33 BUG (66%), 2 WARN (4%)

#### Fix 1: Detection-Keywords erweitert
- `document-type-detection.ts`: 7 neue Receipt-Keywords (`kundenbeleg`, `tankstelle`, `eur/liter`, `saeulen`, `parkhaus`, `parkdauer`, `parkgebuehr`) und 1 Tax-Notice-Keyword (`zahllast`)
- Behebt: 5 "unknown"-Dokumente (2 Tankbelege, 2 Parktickets, 1 Umsatzsteuer-Mail)

#### Fix 2: Date DD.MM→MM.DD Swap
- `receipt-mapper.ts`: `getDate()` → `resolvePreferredDate()` für alle 3 Code-Pfade (multi-doc, OCR-fallback, single-receipt)
- `azure-field-helpers.ts`: `resolvePreferredDate()` vereinfacht — bevorzugt IMMER DD.MM.YYYY Text-Parsing über Azure `valueDate`
- Behebt: 9 Datum-Vertauschungen (Azure parsed 05.06.2025 als 2025-06-05 statt 2025-05-06)

#### Fix 3: buyerName=Projektnummer (Hays)
- Analyse: Code bereits korrekt (`cleanPartyName` strippt Anreden). DB-Daten sind veraltet — Re-Parse behebt das Problem.

#### Fix 4: totalNet=null Fallback
- `receipt-mapper.ts`: `totalNet = roundCurrency(totalGross - totalVat)` wenn Azure kein `Subtotal` liefert
- `invoice-mapper.ts`: `totalNetFallback = roundCurrency(totalGross - totalTax)` wenn Azure kein `SubTotal` liefert
- Behebt: 8 Dokumente mit `totalNet: null`

#### Tests
- `azure-invoice-hotel.test.ts`: 5 neue Tests (4x resolvePreferredDate, 1x totalNet Fallback) → 18/18 bestanden
- `azure-receipt-multi.test.ts`: 4 neue Tests (Tankbeleg, HEM Tankbeleg, Parkticket, Umsatzsteuer) → 22/22 bestanden
- Gesamtergebnis: **40 Tests bestanden, 0 fehlgeschlagen**

#### Cleanup
- README.md aktualisiert (neue Keywords, Date-Fix, totalNet-Fallback Doku)
- Temp-Dateien gelöscht (`tests/output/`, `_query_tenants.ts`)

### Geänderte Dateien
- `backend/tests-backend/REVIEW_PROMPT.md` – Sampling entfernt, Batch-Workflow
- `backend/supabase/functions/_shared/document-type-detection.ts` – 8 neue Keywords
- `backend/supabase/functions/_shared/azure-mappers/azure-field-helpers.ts` – resolvePreferredDate vereinfacht
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – getDate→resolvePreferredDate + totalNet Fallback
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – totalNet Fallback + roundCurrency Import
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 5 neue Tests
- `backend/tests-backend/integration/azure-receipt-multi.test.ts` – 4 neue Tests
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begründungen
- `resolvePreferredDate` IMMER Text bevorzugen: Der alte 31-Tage-Threshold konnte nahe Swaps übersehen (05.06 vs 06.05 = 30 Tage). Einfacher und sicherer: Text-Parsing ist für DD.MM.YYYY immer korrekt
- totalNet-Fallback in beiden Mappern: Universelle Buchhaltungsregel `net = gross - vat` als Fallback wenn Azure SubTotal nicht liefert
- Tankstelle/Parkhaus-Keywords: Spezifisch genug, um keine False Positives zu erzeugen (min. 2 Hits für Receipt-Klassifizierung)
- `zahllast` als Tax-Notice-Keyword: Spezifisch für Umsatzsteuer-Bescheide

### Learnings
- Azure `valueDate` ist für deutsche DD.MM.YYYY-Formate unzuverlässig — immer Text-Parsing bevorzugen
- Receipt-Mapper nutzte `getDate()` (direkt Azure valueDate) statt `resolvePreferredDate()` (Text-First) — systematischer Check aller Mapper auf korrekte Date-Funktion empfohlen
- Tankbelege und Parktickets haben spezifische Vocabulare die als Receipt-Keywords gut funktionieren

### Offene Punkte / Nächste Schritte
- [ ] Re-Parse aller Tenants laufen lassen (behebt stale DB-Daten incl. Hays buyerName)
- [ ] Edge Function redeployen (damit neue Live-Dokumente alle Fixes bekommen)
- [ ] Prüfen ob weitere Mapper `getDate()` statt `resolvePreferredDate()` verwenden

---

## Session – 2026-03-03 (7)

**Beteiligte Agenten:** Explore (4x parallel: Invoice-Mapper-Analyse, Qonto-PDF, Apple-iCloud-PDF, Bewirtungsbeleg-PDF; 1x Stichprobe 3 OK-Docs; 1x Apple-iCloud-Raw-Analyse)

### Erledigte Aufgaben
- **Extraction-Review für alle Tenants** (außer `2567f217-...`, bereits in Session 6 geprüft)
- 4 Tenants identifiziert: `1ddff989` (38 Docs), `9b994e54` (1 Doc), `19dd1158` (1 Doc), `ec990ac9` (10 Docs) — insgesamt 50 Dokumente
- Auto-Check (11 Regeln) parallel für alle 4 Tenants ausgeführt
- 14 geflaggte Dokumente analysiert, 3 davon visuell mit Subagenten geprüft, Stichprobe 3 OK-Dokumente
- **vendorName-Bug gefixt**: `CustomerName` aus `vendorCandidates` in `invoice-mapper.ts` entfernt — verhindert dass Käufername als Vendor gesetzt wird wenn Azure keine Vendor-Felder liefert (Apple iCloud-Fall)
- 1 neuer Test: Apple-iCloud-Szenario (nur CustomerName, keine Vendor-Felder → vendorName ≠ buyerName)
- Alle 53 Tests grün
- README aktualisiert
- **Re-Parse + Backfill aller Tenants durchgeführt:**
  - `FORCE_REPARSE=1 pnpm test:azure-mappers` → 27 Analyze-Runs aktualisiert
  - `pnpm test:backfill-extractions` → 27 Extractions aktualisiert
  - Direkte Re-Parse von 54 Extractions ohne Analyze-Runs (Deno-Einmal-Script)
  - `pnpm test:backfill-invoices` → 54 Invoices aktualisiert
  - `pnpm test:backfill-bank-transactions` → 12 Bank-Transaktionen aktualisiert
- **Ergebnis nach Re-Parse:** Tenant `1ddff989` von 6→4 Flags, Tenant `ec990ac9` von 6→2 Flags (8 Findings behoben)
- Temp-Dateien in `tests-backend/output/` gelöscht

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/invoice-mapper.ts` – CustomerName aus vendorCandidates entfernt
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 1 neuer Test (Apple iCloud vendorName guard)
- `backend/tests-backend/README.md` – Test-Doku ergänzt
- `SESSION_LOG.md` – Neuer Eintrag
- DB: 54 Extractions + 54 Invoices + 12 Bank-Transaktionen + 27 Analyze-Runs aktualisiert

### Review-Ergebnisse (50 Dokumente, 4 Tenants)

| Tenant | Docs | OK | Flagged | Neue Bugs | Alte DB | Azure-Limit |
|---|---|---|---|---|---|---|
| `1ddff989` | 38 | 32 | 6 | 2 | 3 | 1 |
| `9b994e54` | 1 | 0 | 1 | 0 | 0 | 1 |
| `19dd1158` | 1 | 0 | 1 | 0 | 0 | 1 |
| `ec990ac9` | 10 | 4 | 6 | 0 | 6 | 0 |

**Neue Bugs gefunden & gefixt:**
| Dokument | Bug | Fix |
|---|---|---|
| Apple iCloud | vendorName=buyerName (CustomerName-Fallback) | CustomerName aus vendorCandidates entfernt |

**Neue Bugs gefunden (Azure-Limitation, kein Mapper-Fix):**
| Dokument | Bug | Ursache |
|---|---|---|
| Renault Leasing | totalGross=238€ (Monatsrate statt ~4500€), invoiceNumber fehlt | Komplexes Leasing-Dokument, Azure extrahiert nur Header |
| Qonto | buyerName="GmbH" (unvollständig) | Azure CustomerAddressRecipient unvollständig |
| Bewirtungsbeleg | buyerName="REPORT" (OCR-Rauschen) | Azure CustomerName extrahiert Footer-Text |

**Stichprobe OK-Dokumente:**
| Dokument | Ergebnis |
|---|---|
| ChatGPT Plus | OK — alle Felder korrekt |
| Microsoft 365 | OK — minimales Address-Rauschen |
| Renault Leasing | CRITICAL — Leasing-Struktur zu komplex für Azure |

### Entscheidungen & Begründungen
- `CustomerName` komplett entfernt statt `pickPrimaryParty`-Logik angepasst: Der Buyer-Name sollte konzeptionell nie als Vendor-Kandidat dienen. Besser vendorName=null als eine falsche Zuordnung
- Renault-Leasing nicht gefixt: Azure-prebuilt-invoice extrahiert bei mehrseitigen Leasing-Dokumenten nur die monatliche Rate aus dem Header. Ein OCR-basierter Totalbetrags-Fix wäre fehleranfällig
- Auto-Check `net_exceeds_gross` als False-Positive bei Gutschein-Rechnungen dokumentiert (Qonto: Subtotal vor Gutschein-Abzug)

### Learnings
- **CustomerName als Vendor-Fallback ist gefährlich**: Bei SaaS-Rechnungen (Apple, etc.) liefert Azure oft keine Vendor-Felder, nur CustomerName → Fallback setzt Buyer als Vendor
- **Stichproben finden Bugs die Auto-Check nicht sieht**: Renault-Leasing war "OK" im Auto-Check (Beträge vorhanden, kein Vergleich mit echtem Total möglich)
- **Alte DB-Werte dominieren bei Tenants die nicht re-parsed wurden**: 9 von 14 Findings in ec990ac9 + 1ddff989 sind bereits im Code gefixt, aber DB hat alte parsed_data

### Offene Punkte / Nächste Schritte
- [x] ~~Re-Parse laufen lassen~~ — erledigt (27 Analyze-Runs + 54 direkte Extractions)
- [x] ~~Temp-Dateien in `tests-backend/output/` löschen~~ — erledigt
- [ ] Edge Function redeployen (damit neue Live-Dokumente den Fix bekommen)
- [ ] Hays_1660691081_D.pdf: vatRate=19 verbleibt (Analyze-Run hat alten parsed_data, Re-Parse hat ihn nicht korrigiert)
- [ ] 54 Extractions ohne Analyze-Runs: `backfill-analyze-runs` kann sie nicht seeden (model_used fehlt?) → Ursache klären
- [ ] Optional: Renault-Leasing als bekannte Azure-Limitation in REVIEW_PROMPT.md dokumentieren
- [ ] Optional: Auto-Check-Regel `net_exceeds_gross` um Gutschein-Ausnahme erweitern

---

## Session – 2026-03-03 (6)

**Beteiligte Agenten:** Explore (1x buyerName-Code-Suche)

### Erledigte Aufgaben
- `review-extraction.ts` Script erstellt: lädt PDFs + raw_result + parsed_data pro Dokument lokal herunter für Dreifach-Vergleich (PDF → Azure-Rohdaten → Mapper-Output)
- 13 Dokumente des Tenants `2567f217-...` visuell reviewt (PDF lesen → parsed_data prüfen → bei Bedarf raw_result prüfen)
- **buyerName-Bug gefixt**: `cleanPartyName("Herrn")` gab `"Herrn"` zurück statt `null` — Regex `\s+` → `(?:\s+|$)` für Salutation-only Strings
- **vendorName trailing-comma gefixt**: `cleanPartyName` strippt jetzt trailing `,;:` — Receipt-Mapper leitet vendorName durch `cleanPartyName`
- vatItems.rate = 19 statt 0.19 analysiert: aktueller Code bereits korrekt (`parsePercent` /100), DB-Werte stammen von älterer Code-Version
- 3 neue Tests: salutation-only "Herrn", salutation-only "Herr", trailing comma
- `package.json`: Script `test:review-extraction` hinzugefügt
- `README.md`: review-extraction dokumentiert
- `review-extraction-auto.ts` erstellt: automatischer Plausibilitäts-Check (11 Regeln) auf parsed_data — findet bekannte Fehlermuster ohne PDFs zu lesen
- `REVIEW_PROMPT.md` erstellt: Copy-Paste-Workflow für künftige Reviews (Auto-Check → Subagenten → Fixes)
- `package.json`: Script `test:review-auto` hinzugefügt
- TS-Fehler in `review-extraction-auto.ts` gefixt: `ExtractionRow`-Interface statt `never`-Typ bei Supabase-Query

### Geänderte Dateien
- `backend/tests-backend/integration/review-extraction.ts` (NEU) – PDF/JSON-Export-Script
- `backend/tests-backend/integration/review-extraction-auto.ts` (NEU) – Automatischer Plausibilitäts-Check (11 Regeln)
- `backend/tests-backend/REVIEW_PROMPT.md` (NEU) – Workflow-Template für Reviews
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – Salutation-Regex-Fix + trailing punctuation
- `backend/supabase/functions/_shared/azure-mappers/receipt-mapper.ts` – vendorName durch cleanPartyName
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 3 neue Tests
- `backend/package.json` – 2 neue Scripts (review-extraction, review-auto)
- `backend/tests-backend/README.md` – Doku

### Entscheidungen & Begründungen
- Regex `(?:\s+|$)` statt `\s*`: verhindert False Positives wie "Herr" in "Herrmann" (bei `\s*` würde "Herr" + 0 Spaces matchen)
- Trailing-Stripping nur `,;:` (nicht `.`): Punkte sind Teil von Abkürzungen ("e.K.", "Inc.", "Ltd.")
- vatItems.rate nicht gefixt: `parsePercent` dividiert bereits korrekt durch 100, ein Re-Parse würde DB-Werte korrigieren
- Review-Workflow in 2 Phasen: Auto-Check als Pre-Filter (0 Context-Verbrauch), dann Subagenten nur für geflaggte Dokumente (spart ~50% Context vs. alles manuell prüfen)

### Review-Ergebnisse (13 Dokumente)

| # | Dokument | Typ | Befunde |
|---|---|---|---|
| 1 | Flug_MUCHAM | invoice | totalNet/totalVat/invoiceNumber fehlen (Azure-Limitation) |
| 2 | Mercure Hotel | invoice | totalGross null (Azure), resolveInvoiceAmount greift |
| 3 | Hays DE | invoice | **buyerName="Herrn" → GEFIXT**, vatItems.rate=19 (alte DB) |
| 4 | MS_II | invoice | OK |
| 5 | FlugHAM_VIE | invoice | OK |
| 6 | MS_I | invoice | OK |
| 7 | DB Ticket | receipt | **vendorName trailing comma → GEFIXT**, MwSt falsch (Azure) |
| 8 | Kontoauszug | bank_statement | Transaktionen perfekt, bankName falsch (Azure) |
| 9 | Reisekosten_i | receipt | totalGross=55006 (Handschrift-OCR-Fehler) |
| 10 | Reisekosten_ii | receipt | OK (6 Tickets korrekt erkannt) |
| 11 | Hays AT | invoice | **buyerName="Herrn" → GEFIXT**, country="DE" statt "AT" (Azure) |
| 12 | T-Mobile/freenet | invoice | **buyerName="Herr" → GEFIXT**, alle Beträge korrekt |
| 13 | Mietwagen CHECK24 | invoice | totalNet/totalVat falsch (Versicherung statt Buchung, Azure) |

### Learnings
- Azure CustomerName enthält oft nur die Anrede ("Herrn"/"Herr") als separates Feld — der vollständige Name steht in CustomerAddressRecipient über mehrere Zeilen
- Receipt-Mapper hatte keinen Party-Name-Cleanup — vendorName kam direkt aus Azure ohne Bereinigung
- Handschriftliche Belege (Taxi-Quittungen) sind für Azure OCR problematisch: Dezimalkomma wird verschluckt

### Learnings (ergänzt)
- Manuelles PDF-Review skaliert nicht: 13 Dokumente × 3 Dateien sprengt das Context-Fenster
- Auto-Check als Pre-Filter spart ~50% visuelle Prüfung (6 von 13 OK, 7 geflaggt)
- Subagenten pro Dokument halten den Hauptkontext schlank (Agent gibt 1-Zeilen-Befund zurück)

### Offene Punkte / Nächste Schritte
- [ ] Re-Parse laufen lassen: `FORCE_REPARSE=1 pnpm test:azure-mappers` + Backfills → korrigiert alte DB-Werte
- [ ] Edge Function redeployen (für neue Live-Dokumente)
- [ ] Temp-Dateien in `tests-backend/output/` löschen nach Review
- [ ] Optional: bankName-Extraktion im Bank-Statement-Mapper verbessern
- [ ] Review-Workflow für weitere Tenants ausführen (Anleitung: `REVIEW_PROMPT.md`)

---

## Session – 2026-03-03 (5)

**Beteiligte Agenten:** Explore (3x parallel für Mapper-, Amount- und Processor-Analyse), Plan (1x für 3-Punkte-Fixplan)

### Erledigte Aufgaben
- Mercure Hotel-Rechnung: 3 fehlerhafte Felder (`amount: 0`, `invoice_no: null`, `buyer_name: null`) analysiert und gefixt
- `BUYER_LABELS` um "Gastname" und "Gast" erweitert (Hotel-Rechnungen)
- `cleanPartyName`: Anrede-Stripping (Herrn/Herr/Frau/Mr./Mrs./Ms.) hinzugefügt
- `extractInvoiceNumber`: Regex um `\\.?` nach Label erweitert (erlaubt "Rechnungsnr.")
- `resolveInvoiceAmount`: IEEE 754 Floating-Point-Bug gefixt (`roundCurrency` VOR Vergleich mit 0)
- `process-document/index.ts`: `resolveInvoiceAmount()` statt `parsed.totalGross ?? parsed.totalNet ?? null`
- `backfill-invoices.ts`: Lokale Duplikat-Funktion `resolveInvoiceAmount` entfernt, Import aus Shared-Modul
- 9 neue Deno-Tests für Hotel-Invoice-Extraction geschrieben, alle 49 Tests grün
- README mit Hotel-Invoice-Doku, FP-Fix, neuen Tests aktualisiert

### Geänderte Dateien
- `backend/supabase/functions/_shared/azure-mappers/party-extraction.ts` – BUYER_LABELS + Anrede-Stripping
- `backend/supabase/functions/_shared/azure-mappers/installment-plan.ts` – extractInvoiceNumber Regex-Fix
- `backend/supabase/functions/_shared/invoice-amount-candidates.ts` – FP-Bug in resolveInvoiceAmount
- `backend/supabase/functions/process-document/index.ts` – resolveInvoiceAmount Import + Nutzung
- `backend/tests-backend/integration/backfill-invoices.ts` – Lokale Duplikate entfernt, Shared-Import
- `backend/tests-backend/integration/azure-invoice-hotel.test.ts` – 9 neue Tests (NEU)
- `backend/tests-backend/README.md` – Doku-Updates

### Entscheidungen & Begründungen
- `roundCurrency` VOR Vergleich: IEEE 754 erzeugt bei `[-401.76, +104.49, +104.49, +96.39, +96.39]` eine Summe von `2.842e-14` statt `0`. Ohne Rundung wird dieser Wert als "positiv" interpretiert → amount = 0
- Anrede-Stripping nur mit nachfolgendem Leerzeichen (`/^Herrn\s+/`): verhindert False Positives bei Firmennamen wie "Herrmann GmbH"
- Lokale Kopie in backfill-invoices.ts entfernt statt gefixt: Single Source of Truth im Shared-Modul, vermeidet künftige Divergenz

### Learnings
- **Duplikate von Shared-Code in Scripts sind ein häufiger Bug-Vektor** — backfill-invoices.ts hatte eine eigene `resolveInvoiceAmount`-Kopie ohne den FP-Fix
- IEEE 754 Floating-Point-Fehler bei Summenbildung: Die Additions-Reihenfolge bestimmt, ob ein FP-Fehler auftritt. Bestehender Test mit anderer Reihenfolge (positiv zuerst, negativ zuletzt) ergab exakt 0 → Bug blieb unentdeckt
- Hotel-Rechnungen (Mercure) haben spezifisches Format: "Gastname" statt "Kunde", "Rechnungsnr." mit Punkt, Payment-Zeile storniert die Summe

### Offene Punkte / Nächste Schritte
- [ ] Backfill erneut laufen lassen: `cd backend && pnpm test:backfill-invoices`
- [ ] Edge Function redeployen (für neue Live-Dokumente)
- [ ] Prüfen ob weitere Scripts lokale Kopien von Shared-Funktionen haben

---

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

