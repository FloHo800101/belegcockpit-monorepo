# Plan: SFA Cluster Workbench

## Ubersicht

Implementierung der SFA (Steuerberater-Fachanwendung) "Cluster Workbench" als zentraler Arbeitsbereich fur die Kanzlei-Ansicht. Die Workbench folgt strikt dem UX-Contract (Detailseiten Interaction Pattern) und dem SFA Addendum.

---

## Architektur

### Route-Struktur

```
/kanzlei/mandant/:mandantId/monat/:monthId/cluster/:queueId
```

**Queue-IDs:**
- `missing_receipts` - Fehlende Belege
- `clarify_matching` - Zuordnung klaren
- `tax_risks` - Steuerrisiken
- `duplicates_corrections` - Duplikate & Korrekturen
- `fees_misc` - Gebuhren & Sonstiges

### Neue Dateien

1. **`src/features/kanzlei/pages/ClusterWorkbench.tsx`** - Hauptkomponente
2. **`src/features/kanzlei/components/SfaCaseInspector.tsx`** - Sidepanel-Komponente
3. **`src/features/kanzlei/stores/inquiryPackageStore.tsx`** - Ruckfragenpaket-State
4. **`src/features/kanzlei/data/sfaMockData.ts`** - SFA-spezifische Mock-Daten

### Anpassungen an bestehenden Dateien

1. **`src/App.tsx`** - Neue Route hinzufugen
2. **`src/data/types.ts`** - SFA-spezifische Typen erweitern

---

## Datenmodell

### SfaCase Interface

```typescript
interface SfaCase {
  id: string;
  date: string;
  amount: number;
  direction: 'in' | 'out';
  counterparty: string;
  purpose: string;  // Realistischer Banktext via purposeGenerator
  paymentMethod: 'Bank' | 'Card' | 'PayPal' | 'Stripe' | 'Amazon';
  
  // Status
  mandantStatus: 'handed_over' | 'rejected_match' | 'uploaded_receipt' | 'marked_private';
  caseStatus: 'open' | 'waiting_mandant' | 'done';
  waitingSince?: string;  // ISO timestamp
  
  // Matching
  confidence?: number;
  triggerReasons: TriggerReason[];  // 'mehrdeutig' | 'betrag_abweichung' | 'datum_abweichung' | 'gebuehr_unsicher'
  
  // Zugeordneter Beleg
  receipt?: {
    id: string;
    fileName: string;
    date: string;
    amount: number;
  } | null;
  
  // Audit Trail
  auditTrail: AuditEntry[];
}

interface AuditEntry {
  at: string;  // ISO timestamp
  actor: 'mandant' | 'sfa';
  action: string;
  note?: string;
}

interface InquiryPackageItem {
  caseId: string;
  questionText: string;
}

interface InquiryPackageStore {
  mandantId: string;
  monthId: string;
  items: InquiryPackageItem[];
}
```

### Trigger-Reasons (Prufanlass)

| Key | Badge-Label |
|-----|-------------|
| `ambiguous` | Mehrdeutig |
| `amount_deviation` | Betrag weicht ab |
| `date_deviation` | Datum weicht ab |
| `fee_uncertain` | Gebuhr unsicher |

---

## Komponenten-Struktur

### 1. ClusterWorkbench.tsx

**Layout:**
- Nutzt `DetailPageShell` fur 2-Spalten-Layout
- Header mit "[Mandant] - [Monat] - [Queue-Name]"
- Tabelle links (60-65%), Sidepanel rechts (35-40%)

**Tabellen-Spalten (exakte Reihenfolge):**

| # | Spalte | Inhalt |
|---|--------|--------|
| 1 | Datum | formatDate() |
| 2 | Empfanger/Sender | counterparty + PaymentMethod-Badge |
| 3 | Betreff / Verwendungszweck | purpose (realistischer Banktext) |
| 4 | Betrag | formatCurrency() |
| 5 | Zugeordneter Beleg | receipt?.fileName oder "-" |
| 6 | Prufanlass | Badges: Mehrdeutig, Betrag weicht ab, etc. |
| 7 | Mandanten-Status | z.B. "An Kanzlei ubergeben" |
| 8 | Warten seit | nur wenn caseStatus=waiting_mandant |
| 9 | Confidence | X% (optional) |

**Sortierung Default:**
1. Hoher Betrag zuerst (abs)
2. Niedrigere Confidence
3. Warten seit absteigend (alteste zuerst)

**Interaktion:**
- Klick auf Zeile offnet/aktualisiert Sidepanel
- Aktive Zeile bleibt markiert
- Keine Aktionen in Tabelle

### 2. SfaCaseInspector.tsx (Sidepanel)

**Struktur (Flex-Column, immer identisch):**

```
+----------------------------------+
| Header (flex-shrink-0)           |
|   - Queue-Titel                  |
|   - Status-Badge                 |
|   - Close (X)                    |
+----------------------------------+
| Erklarungstext                   |
|   1-2 Satze, ruhig               |
+----------------------------------+
| Progress Callout                 |
|   "Noch X von Y Fallen offen"    |
+----------------------------------+
| Content (flex-1, overflow-auto)  |
|                                  |
|   A) Audit Trail                 |
|      - Zeitpunkt + Akteur        |
|      - Warten seit X Tagen       |
|                                  |
|   B) Transaktionsdetails         |
|      - Datum, Betrag, Empf/Send  |
|      - Verwendungszweck          |
|      - Zahlungsart Badge         |
|      - Referenz (optional)       |
|                                  |
|   C) Belegdetails (wenn vorh.)   |
|      - Dateiname, Datum, Betrag  |
|                                  |
|   D) Abweichungen (wenn vorh.)   |
|      - "Betrag weicht ab: -10€"  |
|      - "Datum weicht ab: 7 Tage" |
|                                  |
+----------------------------------+
| Aktionen                         |
|   Primary:                       |
|     - Zuordnung setzen/andern    |
|   Secondary:                     |
|     - Als Gebuhr markieren       |
|     - Zu Ruckfragen hinzufugen   |
|   Ghost:                         |
|     - In Risikofalle verschieben |
+----------------------------------+
| Footer Navigation (flex-shrink-0)|
|   [Vorheriger Fall] [Nachst...]  |
+----------------------------------+
```

**Aktionen-Logik:**

1. **Zuordnung setzen/andern** (Primary)
   - Nur wenn Belegkandidaten vorhanden
   - Offnet Inline-Zuordnungsdialog

2. **Als Gebuhr markieren** (Secondary)
   - Markiert Fall als erledigt
   - Schreibt Audit-Eintrag
   - Auto-Advance

3. **Zu Ruckfragen hinzufugen** (Secondary)
   - Offnet Inline-Kommentarfeld
   - Pflicht-Text: "Was soll der Mandant klaren?"
   - Hinzufugen -> Case zum Ruckfragenpaket

4. **In Risikofalle verschieben** (Ghost)
   - Nur bei bestimmten Fallen sinnvoll

### 3. Inline-Kommentarfeld

**Erscheint nach "Zu Ruckfragen hinzufugen":**

```
+----------------------------------+
| Textarea                         |
| Placeholder: "Was soll der       |
|   Mandant klaren?"               |
+----------------------------------+
| [Abbrechen]  [Hinzufugen]        |
|              (disabled ohne Text)|
+----------------------------------+
```

**Nach Hinzufugen:**
- Fall wird Ruckfragenpaket hinzugefugt
- Audit-Trail-Eintrag: "SFA hat Ruckfrage hinzugefugt"
- Dezente Inline-Bestatigung (kein Toast)

### 4. Ruckfragenpaket-Store

**Globaler State pro Mandant/Monat:**

```typescript
// Context-basierter Store
interface InquiryPackageContext {
  items: InquiryPackageItem[];
  addItem: (caseId: string, questionText: string) => void;
  removeItem: (caseId: string) => void;
  copyTextAndClear: () => string;  // Generiert E-Mail-Text
}
```

**"Text kopieren" Logik:**
1. Generiert formatierten E-Mail-Text
2. Kopiert in Zwischenablage
3. Alle Falle auf `waiting_mandant` setzen
4. `waitingSince` = jetzt
5. Paket leeren

---

## Mock-Daten Spezifikation

### Pro Queue: 10-15 Falle

**Pflicht-Anforderungen:**
- Mind. 3 Falle mit `caseStatus=waiting_mandant` + `waitingSince` (verschiedene Tage)
- Audit Trail pro Fall: 2-3 Eintrage
- Verwendungszweck via `generateDeterministicPurpose()`
- Realistische Banktexte, KEINE UI-Texte

**Beispiel Audit-Trail:**
```typescript
[
  { at: '2026-01-15T10:30:00Z', actor: 'mandant', action: 'Zuordnung abgelehnt' },
  { at: '2026-01-18T14:22:00Z', actor: 'sfa', action: 'Ruckfrage hinzugefugt', note: 'Welcher Lieferant?' }
]
```

**Beispiel Mandanten-Status Labels:**
- "An Kanzlei ubergeben"
- "Zuordnung abgelehnt"
- "Beleg hochgeladen"
- "Privat markiert"

---

## Implementierungs-Schritte

### Schritt 1: Typen erweitern (types.ts)

- `SfaCase` Interface
- `AuditEntry` Interface
- `TriggerReason` Type
- `SfaQueueId` Type
- `SfaQueueConfig` Record

### Schritt 2: Mock-Daten erstellen (sfaMockData.ts)

- 10-15 Cases pro Queue (5 Queues = 50-75 Cases total)
- Audit-Trails mit realistischen Zeitstempeln
- Nutzung von `purposeGenerator.ts`
- waitingSince fur 3+ Cases

### Schritt 3: Ruckfragenpaket-Store (inquiryPackageStore.tsx)

- React Context + useReducer Pattern
- Actions: add, remove, copyAndClear
- E-Mail-Text-Generator

### Schritt 4: SfaCaseInspector (SfaCaseInspector.tsx)

- Flex-Column Layout
- Header mit Status-Badge
- Scrollbarer Content-Bereich
- Audit-Trail-Anzeige
- Aktionen-Bereich
- Footer-Navigation

### Schritt 5: ClusterWorkbench (ClusterWorkbench.tsx)

- DetailPageShell-Integration
- Tabelle mit allen 9 Spalten
- Sortierung implementieren
- Zeilen-Selektion
- Sidepanel-Toggle

### Schritt 6: Routing (App.tsx)

- Neue Route unter `/kanzlei`
- Parameter: mandantId, monthId, queueId

---

## Sprache (verbindlich)

| Englischer Term | Deutscher UI-Text |
|-----------------|-------------------|
| missing_receipts | Fehlende Belege |
| clarify_matching | Zuordnung klaren |
| tax_risks | Steuerrisiken |
| duplicates_corrections | Duplikate & Korrekturen |
| fees_misc | Gebuhren & Sonstiges |
| ambiguous | Mehrdeutig |
| amount_deviation | Betrag weicht ab |
| date_deviation | Datum weicht ab |
| fee_uncertain | Gebuhr unsicher |
| waiting_mandant | Wartet auf Mandant |
| open | Offen |
| done | Erledigt |

---

## Kritische Dateien fur Implementierung

1. `src/data/types.ts` - Erweiterte Typdefinitionen
2. `src/features/kanzlei/pages/ClusterWorkbench.tsx` - Hauptseite
3. `src/features/kanzlei/components/SfaCaseInspector.tsx` - Sidepanel
4. `src/features/kanzlei/stores/inquiryPackageStore.tsx` - Ruckfragenpaket
5. `src/features/kanzlei/data/sfaMockData.ts` - Mock-Daten
6. `src/App.tsx` - Route-Integration
