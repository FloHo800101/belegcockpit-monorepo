# BelegCockpit – UX Contract (Detailseiten Interaction Pattern)

## Ziel

Detailseiten sind Workflow-Seiten für Mandanten. Nutzer bearbeiten Aufgaben schnell, ohne Überforderung (2-Minuten-Flow).

## Layout

- Links: Tabelle (nur Auswahl/Überblick)

- Rechts: persistentes Sidepanel (Details + Aktionen)

- Keine Aktionen in der Tabelle.

## Interaktion

- Klick auf Tabellenzeile öffnet/aktualisiert Sidepanel.

- Hover: nur visuelle Hervorhebung.

- Aktive Zeile bleibt markiert.

## Sidepanel Aufbau (immer gleich)

1) Header: Cluster-Titel + Status

2) Kurzer Erklärungstext (menschlich)

3) Fortschritt (z. B. „Noch X von Y offen")

4) Details (read-only)

5) Aktionen (einziger Ort für Interaktion)

6) Navigation: „Zur vorherigen Zahlung" / „Nächste Zahlung klären"

## Sidepanel – Flex-Column Layout (Struktur)

Das Sidepanel verwendet ein Flex-Column Layout für klare visuelle Struktur:

```
┌─────────────────────────────┐
│ Header (flex-shrink-0)      │  ← Immer oben, scrollt nicht
├─────────────────────────────┤
│ Progress Callout            │  ← Immer sichtbar
├─────────────────────────────┤
│                             │
│ Content (flex-1,            │  ← Scrollbar bei Overflow
│   overflow-y: auto)         │
│                             │
├─────────────────────────────┤
│ Footer Navigation           │  ← Immer unten, scrollt nicht
│ (flex-shrink-0)             │
└─────────────────────────────┘
```

- **Wrapper**: `display: flex; flex-direction: column; height: 100%`
- **Header**: `flex-shrink: 0` – bleibt oben fixiert
- **Content**: `flex: 1; overflow-y: auto; min-height: 0` – scrollbar
- **Footer**: `flex-shrink: 0` – bleibt unten fixiert, mit `border-top` und dezenter `shadow`

## Sidepanel – Open/Close & Fokus

- Sidepanel ist standardmäßig geschlossen, MUSS aber immer schließbar sein:

  - Schließen über „X" im Panel-Header (Pflicht)

  - Optional zusätzlich: ESC-Taste

- Wenn Sidepanel geschlossen ist:

  - Linke Tabelle nutzt die volle verfügbare Breite (kein „leerer" rechter Bereich)

  - Klick auf eine Tabellenzeile öffnet das Sidepanel wieder und zeigt Details+Aktionen für genau diese Zeile

- Beim Schließen des Sidepanels werden NICHT gespeicherte Eingaben verworfen (z. B. Upload-Auswahl, Kommentar-Felder).

## Sidepanel – Footer Navigation (immer sichtbar)

- Die Navigation „Vorherige" / „Nächste Zahlung klären" ist im Sidepanel immer sichtbar (als Footer innerhalb des Flex-Layouts).

- Sie darf nicht „ganz unten im langen Scroll" verschwinden.

- Buttons bleiben auch bei kleinem Viewport erreichbar; bei Overflow scrollt nur der Content-Bereich, nicht Header/Footer.

- **Visuelles Gewicht**:
  - Footer mit `border-top` und dezenter `shadow` abgesetzt
  - Hintergrund: `bg-background` (solide, kein Blur nötig)

- **Button-Hierarchie** (Secondary-Emphasis, nicht Primary):

  - „Nächste Zahlung klären" = **Outline Button mit Akzent** (border-primary/30, text-primary)
    → Erkennbar als nächster Schritt, aber nicht so dominant wie Primary Action „Beleg hochladen"
  
  - „Vorherige" = **Ghost Button** (dezent, text-muted-foreground)

- Beide Buttons in einer Zeile, ausreichend große Klickfläche.

## Wizard Footer Navigation (einheitlich auf allen Wizard-Steps)

Die Wizard-Seiten (Upload → Offene Punkte → Zu prüfende Punkte → Abschluss) verwenden eine **einheitliche Footer-Navigation**:

### Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← Zurück          Direkt an Kanzlei übergeben          Weiter →   │
│  (links außen)             (Mitte, Ghost)            (rechts außen) │
└─────────────────────────────────────────────────────────────────────┘
```

- **Max-Width**: 1720px, zentriert mit Padding
- **Buttons ganz außen**: „Zurück" links am Rand, „Weiter" rechts am Rand
- **Mitte**: Optionaler CTA „Direkt an Kanzlei übergeben" (Ghost-Button)

### Button-Hierarchie

- **Zurück** = Outline Button (links außen)
- **Direkt an Kanzlei übergeben** = Outline Button mit Primary-Akzent (Mitte): `border-primary/30`, `text-primary`, hover: `bg-primary/5`
- **Weiter** = Primary Button (rechts außen) mit **weißer Schrift** (Pflicht)

### Regeln

1. **Keine doppelten Navigationspfade**: Kein Header-Back zusätzlich zum Footer
2. **Footer verdeckt nichts**: Bei sichtbarem Sidepanel bleibt Footer im Content-Grid
3. **Konsistente Beschriftung**: „Zurück", „Weiter zu [Ziel]", „Direkt an Kanzlei übergeben"

### „Direkt an Kanzlei übergeben" Dialog

Klick öffnet Bestätigungs-Dialog:

- **Titel**: „Monat an Kanzlei übergeben?"
- **Body**: „Du kannst diesen Schritt überspringen. Die Kanzlei klärt den Rest. Du kannst später jederzeit wieder einsteigen."
- **Transparenz-Zeile**: „Aktueller Stand: X offene Punkte · Y Zuordnungen zum Prüfen"
- **Buttons**: „Abbrechen" (Secondary), „An Kanzlei übergeben" (Primary)

Bestätigung führt immer zur **Abschlussseite**.

## Fortschritt & Priorität (prominent)

- Direkt unter dem Erklärungstext steht ein hervorgehobenes Progress-Element (Callout):

  - Headline (fett): „Noch X von Y Zahlungen ohne Beleg"

  - Subtext: „Jede geklärte Zahlung bringt dich näher zum Monatsabschluss."

  - Prioritäts-Badge: „Wichtig · hoher Betrag" (bei diesem Cluster Pflicht)

- Dieses Progress-Element ist visuell als Callout hervorgehoben:

  - Leichte rote Tönung (destructive/5)

  - Rote Akzentlinie links

  - AlertTriangle Icon

  - Ohne Alarmismus, aber klar erkennbar als wichtig

## Upload Interaction Pattern (Inline, ohne Kontextwechsel)

- „Beleg hochladen" öffnet IM Sidepanel eine Inline Upload-Card (erweiterbarer Bereich).

- Kein Fullscreen-Modal, kein Seitenwechsel, kein Toast.

- Upload-Card enthält:

  - Drag & Drop Zone + „Datei auswählen" Button

  - Hinweis: „PDF, JPG, PNG – max. 10 MB"

  - Dateiliste mit ausgewählten Dateien (Name, Größe) + „Entfernen" pro Datei

  - Buttons:

    - „Abbrechen" (klappt zu, verwirft Auswahl)

    - „Upload speichern" (disabled bis mind. 1 Datei gewählt)

  - Während Upload: Loading-State, Buttons disabled

- Nach „Upload speichern":

  - Aufgabe als erledigt markieren

  - Zeile aus Tabelle entfernen

  - Fortschritt aktualisieren

  - Auto-Advance zur nächsten offenen Zahlung (Sidepanel + aktive Zeile wechseln)

  - Wenn keine offenen Zahlungen mehr: Abschlusszustand „Cluster erledigt" + CTA „Zum nächsten Cluster"

- Fehlerfall: Inline Fehler in Upload-Card anzeigen, Auswahl bleibt erhalten.

- Beim Wechsel der selektierten Zeile wird unsaved Upload-Auswahl automatisch geleert/geschlossen.

## Aktionen

- Max. 2 Primary Actions.

- Secondary Actions dezent.

- Ausnahmen (z. B. „Kein Beleg vorhanden", „An Kanzlei übergeben") nur mit Pflicht-Kommentar.

- Keine Success-Modals, keine Toaster, nach Aktion Auto-Advance zur nächsten Aufgabe.

## Verbote

- Keine Inline-Aktionen in Tabellen.

- Keine Bulk-Aktionen.

- Keine Fach-/Buchhalter-Sprache.

- Keine Kanzlei-Funktionen prominent.

## Desktop Breite

- Desktop-first Arbeitsoberfläche.

- Keine enge max-width Content-Column.

- Zielbreite: max 1600–1720px.

- Spalten: Tabelle 60–65%, Sidepanel 35–40% (typisch 480–520px, min 420px).

## Responsive Desktop Scaling (1280px → 1920px+)

### Zielbereich

- **Minimum**: 1280px (Laptop)
- **Optimal**: 1600-1720px (Desktop)
- **Maximum**: 1920px+ (Large Desktop)

### Skalierungsverhalten

Die UI skaliert fließend ohne harte Breakpoints mittels CSS `clamp()`:

| Element | 1280px | 1920px |
|---------|--------|--------|
| Sidebar-Breite | 224px | 288px |
| Basis-Abstand (--space-md) | 12px | 16px |
| Großer Abstand (--space-lg) | 16px | 24px |
| Basisschrift (--text-base) | 14px | 16px |
| Überschrift (--text-2xl) | 22px | 24px |

### CSS-Variablen (in index.css)

```css
:root {
  /* Spacing */
  --space-xs: clamp(0.25rem, 0.2rem + 0.25vw, 0.5rem);
  --space-sm: clamp(0.5rem, 0.4rem + 0.35vw, 0.75rem);
  --space-md: clamp(0.75rem, 0.6rem + 0.5vw, 1rem);
  --space-lg: clamp(1rem, 0.8rem + 0.65vw, 1.5rem);
  --space-xl: clamp(1.5rem, 1.2rem + 0.85vw, 2rem);
  --space-2xl: clamp(2rem, 1.6rem + 1vw, 2.5rem);
  
  /* Typography */
  --text-xs: clamp(0.6875rem, 0.65rem + 0.1vw, 0.75rem);
  --text-sm: clamp(0.8125rem, 0.78rem + 0.12vw, 0.875rem);
  --text-base: clamp(0.875rem, 0.82rem + 0.15vw, 1rem);
  --text-lg: clamp(1rem, 0.95rem + 0.18vw, 1.125rem);
  --text-xl: clamp(1.125rem, 1.05rem + 0.2vw, 1.25rem);
  --text-2xl: clamp(1.375rem, 1.25rem + 0.35vw, 1.5rem);
  
  /* Layout */
  --sidebar-width: clamp(14rem, 12rem + 3vw, 18rem);
}
```

### Tailwind-Utilities

Nutze die `fluid-*` Klassen statt fixer Werte:

- **Spacing**: `p-fluid-md`, `gap-fluid-lg`, `space-y-fluid-sm`
- **Typography**: `text-fluid-base`, `text-fluid-lg`, `text-fluid-2xl`
- **Sidebar**: `w-sidebar`

### Regeln

1. **Keine fixen px-Werte** für Abstände in Layout-Komponenten
2. **Container max-width**: `max-w-[90%] 2xl:max-w-[1720px]` (prozentual bis max)
3. **Sidepanel**: Bleibt bei fixer Breite (520px) für Konsistenz
4. **Schriftgrößen**: Fluid für UI-Elemente, fix für kritische Lesbarkeit

## Testdaten-Qualität (Banktexte)

### Verwendungszweck-Regel (verbindlich)

- Das Feld `purpose` / „Verwendungszweck" enthält **ausschließlich realistische Bank-/Kartenumsatztexte** wie sie auf echten Kontoauszügen erscheinen.
- **NIEMALS** dürfen Status-/System-/UI-Texte in diesem Feld stehen (z. B. „Beleg fehlt", „Wichtiger Posten", „Monatsrechnung fehlt").
- Status-Informationen werden **separat** als UI-Badges, Labels oder im Feld `mandantReasonHint` geführt.

### Beispiele für korrekte Verwendungszwecke

```
RE 2026-001234 Notebook Zubehör
AMZ*Marketplace 19.01 123-4567890-1234567
PayPal *MEDIA MARKT Ref: PP-8K3J…
Kartenzahlung 20.01 MEDIAMARKT Fil. 0423
SEPA-LASTSCHRIFT ADOBE *CREATIVE CLOUD INV 67382
UEBERWEISUNG RECHNUNG 4711 KdNr 778899
Gutschrift Retoure 123-4567890-1234567
```

### Technische Umsetzung

- Alle Mock-/Seed-/Testdaten nutzen die zentrale Utility `src/data/purposeGenerator.ts`.
- Die Funktion `generateDeterministicPurpose(txId, merchant, paymentMethod, date)` liefert konsistente, realistische Texte.
- Für jeden Händler gibt es spezifische Templates; Fallbacks basieren auf der Zahlungsart (Card, Bank, PayPal).

### Kombination Empfänger + Verwendungszweck

- Bei Testdaten sind `merchant` und `purpose` stets plausibel kombiniert.
- Beispiel: `merchant: "BAUHAUS"` → `purpose: "KARTENZAHLUNG BAUHAUS FIL 0423 15.01"`

## Review-Seiten (Zuordnungen kurz prüfen)

### Prinzip

Review-Seiten zeigen nur **kuratierte Prüffälle** – NICHT alle Matches. Ein Match erscheint hier nur, wenn:

1. Match-Confidence unter Schwelle (z. B. < 90%)
2. Betrag weicht ab (konfigurierbare Toleranz)
3. Datumsdifferenz > X Tage
4. Klassifizierung unsicher (z. B. automatisch erkannte Gebühr)
5. Mehrdeutigkeit (mehrere mögliche Belege für 1 Transaktion oder umgekehrt)

Vollständige/hoch-sichere Matches werden NICHT angezeigt (Overload vermeiden).

### Aktionen

- **Zuordnung bestätigen**: Match als korrekt markieren, Item erledigt
- **Zuordnung lösen**: Match als unklar markieren, bleibt offen für Kanzlei
- **An Kanzlei übergeben**: Mit Pflicht-Kommentar

### Ziel

Mandant prüft in **< 2 Minuten**. Keine Detailbearbeitung, keine Buchung – nur „bestätigen" oder „lösen".

### UI-Elemente

- Tabelle: Datum, Empfänger, Betreff, Betrag, Zugeordneter Beleg, Prüfanlass, Confidence
- Sidepanel: Transaktionsdetails, Belegdetails, Abweichungen, Aktionen
- Sortierung: Hoher Betrag zuerst, dann niedrigere Confidence

---

## SFA Addendum (Kanzlei-Ansicht)

### Sprache & Eindeutigkeit (verbindlich)

- Alle UI-Texte sind ausschließlich auf Deutsch.
- Kein Interpretationsspielraum: Wortlaut aus UX-Contract und Addendum ist normativ.

### Kommunikationsprinzip (Phase 1)

- Keine In-App-Kommunikation.
- Rückfragen an Mandanten erfolgen über ein Rückfragenpaket mit „Text kopieren" (Copy & Paste für E-Mail).

### SFA-Aktionen

- Aktionen nur im Sidepanel (wie Mandant).
- Bulk-Aktionen sind standardmäßig deaktiviert (Phase 1).
- Jede SFA-Aktion schreibt einen Audit-Eintrag (Zeitpunkt, User, Aktion, Kommentar optional).

### Wartestatus

- Fälle können den Status `waiting_mandant` besitzen.
- UI zeigt „Warten seit X Tagen" (berechnet aus `waitingSince` Timestamp).
- Filter/Badge „Warten auf Mandant" ist Pflicht auf Dashboard und Cockpit.

### Rückfragenpaket

- SFA kann Fälle zu einem Rückfragenpaket hinzufügen (pro Mandant/Monat).
- Rückfragenpaket enthält pro Fall einen Pflicht-Kommentar „Was soll der Mandant klären?"
- Nach „Text kopieren" werden Fälle auf `waiting_mandant` gesetzt (Timestamp = jetzt) und das Paket wird geleert.

---

## Design System – Konsistenzregeln (verbindlich)

### Farbsystem (Color Set D)

- **Primary**: Violet #6D28D9 (HSL: 263 82% 50%)
- **Signal/Warning**: Orange #EA580C (HSL: 21 90% 48%)
- **Success**: Grün (wie gehabt, harmonisiert)

### Buttons

- **Primary Buttons** (lila Hintergrund): IMMER weiße Schrift (`text-primary-foreground`)
- **Warning/Destructive Buttons**: IMMER weiße Schrift
- **Outline Buttons**: Standard-Textfarbe mit sichtbarem Rahmen
- **Ghost Buttons**: Dezent, ohne Hintergrund

### Tabellen

- **Hintergrund**: IMMER weiß (`bg-card`)
- **Rahmen**: Sichtbar (`border-border-strong`, ca. 1px)
- **Header**: Leicht grauer Hintergrund (`bg-muted`)
- **Zeilenränder**: Dezente Linien zwischen Zeilen

### Karten/Kärtchen

- **Hintergrund**: IMMER weiß (`bg-card`), außer für Hervorhebung
- **Hervorhebung**: Warnung/Signal = leicht gelb/orange getönter Hintergrund (`bg-warning-muted`)
- **Rahmen**: Sichtbar (`border-border-strong`)
- **Ecken**: Subtil gerundet (`rounded-card` = 8px), NICHT stark rund

### Border-Radius (DATEV-nah: subtil)

- **Cards**: 8px (`--radius-card`)
- **Buttons**: 6px (`--radius-button`)
- **Inputs**: 6px (`--radius-input`)
- **Badges**: 6px (`--radius-badge`) – KEINE Pills

### Badges

- **Primary/Warning/Success/Destructive**: Solid-Hintergrund mit weißer Schrift
- **Outline**: Standard-Text mit sichtbarem Rahmen
- **Keine schwarze Schrift auf farbigem Hintergrund**

### Seiten-Hintergrund

- **Seiten-Hintergrund**: Leicht grau (`bg-background`, HSL: 220 14% 92%)
- **Content-Bereiche**: Weiß (`bg-card`) mit klarem Rahmen zur Abgrenzung

### Tabellen-Layout (Standard)

- **Tabellen enden bei der letzten Zeile**: Keine leeren Flächen unter der letzten Datenzeile
- **Pagination direkt unter Tabelle**: Kein Leerraum zwischen letzter Zeile und Pagination
- **Wizard-Navigation unter Tabelle**: Footer-Bar erscheint unter dem Tabellen-Container
- **Kein `flex-1` für Tabellen-Container**: Tabelle passt sich an Inhaltshöhe an, füllt nicht den Viewport
- **Struktur**: Tabelle → Pagination (optional) → Wizard Footer (außerhalb des Tabellen-Containers)
