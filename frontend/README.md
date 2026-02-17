# BelegCockpit

Ein modernes Buchhaltungs-Cockpit für Mandanten und Kanzleien zur Verwaltung von Belegen, Transaktionen und monatlichen Buchungsperioden.

## Architektur

### Microservice-Ready Feature-Architektur

Das Projekt folgt einer **Feature-basierten Ordnerstruktur**, die eine spätere Aufteilung in Microservices ermöglicht:

```
src/
├── features/
│   ├── mandant/              # Mandant-Feature (könnte eigenständiger Service werden)
│   │   ├── components/       # Feature-spezifische Komponenten
│   │   ├── pages/            # Seiten-Komponenten
│   │   │   └── wizard/       # URL-basierter Wizard mit eigenen Routen
│   │   │       ├── hooks/    # Wizard-spezifische Hooks
│   │   │       ├── WizardLayout.tsx
│   │   │       ├── MonthSetup.tsx
│   │   │       ├── OpenItems.tsx
│   │   │       ├── ClusterDetail.tsx
│   │   │       ├── UncertainMatches.tsx
│   │   │       ├── Completion.tsx
│   │   │       └── index.ts  # Barrel-Export
│   │   └── hooks/            # Feature-spezifische Hooks
│   │
│   ├── kanzlei/              # Kanzlei-Feature (könnte eigenständiger Service werden)
│   │   ├── components/
│   │   └── pages/
│   │
│   └── shared/               # Geteilte Feature-Komponenten
│       └── components/
│
├── components/ui/            # Wiederverwendbare UI-Komponenten (shadcn/ui)
├── store/                    # Globaler State (Context/Reducer)
├── data/                     # Typen und Mock-Daten
├── hooks/                    # Globale Hooks
├── lib/                      # Utilities
└── pages/                    # Standalone-Seiten (Landing, NotFound)
```

### Routing-Konventionen

#### Mandant-Bereich

| Route | Komponente | Beschreibung |
|-------|------------|--------------|
| `/mandant` | `MandantDashboard` | Dashboard mit Monatsübersicht |
| `/mandant/meine-daten` | `MandantMeineDaten` | Stammdaten-Verwaltung |
| `/mandant/monat/neu/setup` | `MonthSetup` | Neuen Monat anlegen + Upload |
| `/mandant/monat/:monthId/offene-punkte` | `OpenItems` | Cluster-Übersicht offener Punkte |
| `/mandant/monat/:monthId/offene-punkte/:clusterId` | `ClusterDetail` | Transaktionen eines Clusters |
| `/mandant/monat/:monthId/unsichere-matches` | `UncertainMatches` | Unsichere Zuordnungen prüfen |
| `/mandant/monat/:monthId/abschluss` | `Completion` | Monat abschließen |
| `/mandant/uebergabe/:monthId` | `MandantUebergabe` | Übergabe an Kanzlei |

#### Kanzlei-Bereich

| Route | Komponente | Beschreibung |
|-------|------------|--------------|
| `/kanzlei` | `KanzleiCockpit` | Übersicht aller Mandanten |
| `/kanzlei/mandant/:id` | `MandantDetail` | Detail-Ansicht eines Mandanten |
| `/kanzlei/mandant/:id/cluster/:clusterKey` | `ClusterWorklist` | Cluster-Arbeitsliste |
| `/kanzlei/mandant/:id/risk` | `RiskQueue` | Risiko-Warteschlange |

### URL-basiertes Wizard-Routing

Der Mandant-Wizard verwendet **URL-basiertes Routing** statt internem State:

**Vorteile:**
- ✅ Deep-Linking & Bookmarks
- ✅ Browser-Navigation (Zurück/Vorwärts)
- ✅ Teilbare URLs für Support
- ✅ Analytics per Route
- ✅ Testbarkeit
- ✅ Code-Splitting möglich
- ✅ Microservice-Ready

**Navigation-Hook:**
```tsx
import { useWizardNavigation } from '@/features/mandant/pages/wizard';

function MyComponent() {
  const { 
    monthId, 
    clusterId, 
    currentStep,
    goToOpenItems,
    goToCluster,
    goToUncertainMatches,
    goToCompletion 
  } = useWizardNavigation();
}
```

## Technologie-Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS, shadcn/ui
- **State:** React Context + useReducer
- **Routing:** React Router v6
- **Data Fetching:** TanStack Query (vorbereitet für Backend)

## Entwicklung

```sh
# Abhängigkeiten installieren
npm install

# Entwicklungsserver starten
npm run dev

# Build erstellen
npm run build
```

## Projekt-Info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## Deployment

Öffne [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) und klicke auf Share → Publish.

## Custom Domain

Unter Project > Settings > Domains kann eine eigene Domain verbunden werden.

Mehr Infos: [Custom Domain Setup](https://docs.lovable.dev/features/custom-domain#custom-domain)
