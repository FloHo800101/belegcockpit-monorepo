import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ListFilter, LayoutGrid, Check, AlertTriangle, FileQuestion, HelpCircle, Clock, X, Info } from 'lucide-react';
import { differenceInDays, parseISO, isToday, isYesterday, format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BelegeAnfordernDialog } from '../components/BelegeAnfordernDialog';
import { AutoBestaetigungDialog } from '../components/AutoBestaetigungDialog';
import { mandantenData, type MandantRow, type MandantStatus, type PendingReason, type ActivityActor } from '@/data/arbeitskorbMandanten';

// Status display mapping
const STATUS_DISPLAY: Record<MandantStatus, { label: string; color: string }> = {
  OVERDUE: { label: 'Überfällig', color: 'destructive' },
  WAITING: { label: 'Warten', color: 'muted' },
  REVIEW: { label: 'Kanzlei prüft', color: 'warning' },
  READY: { label: 'Bereit', color: 'success' },
};

// Helper: Calculate dueInDays from row
const getDueInDays = (row: MandantRow): number | null => {
  if (row.dueInDays !== undefined) {
    return row.dueInDays;
  }
  return null; // No due date available
};

// Helper: Format due date display
const formatDueDate = (dueInDays: number | null): { text: string; colorClass: string } => {
  if (dueInDays === null) {
    return {
      text: '—',
      colorClass: 'text-muted-foreground',
    };
  }
  if (dueInDays < 0) {
    const overdueDays = Math.abs(dueInDays);
    return {
      text: `überfällig seit ${overdueDays} ${overdueDays === 1 ? 'Tag' : 'Tagen'}`,
      colorClass: 'text-destructive',
    };
  }
  if (dueInDays === 0) {
    return {
      text: 'heute fällig',
      colorClass: 'text-orange-600',
    };
  }
  if (dueInDays <= 2) {
    return {
      text: `fällig in ${dueInDays} ${dueInDays === 1 ? 'Tag' : 'Tagen'}`,
      colorClass: 'text-orange-600',
    };
  }
  return {
    text: `fällig in ${dueInDays} Tagen`,
    colorClass: 'text-muted-foreground',
  };
};

// Helper: Get effective status (ensures OVERDUE is consistent with dueInDays)
const getEffectiveStatus = (row: MandantRow): MandantStatus => {
  const dueInDays = getDueInDays(row);
  
  // If status is OVERDUE but dueInDays >= 0, fallback to REVIEW
  if (row.status === 'OVERDUE' && dueInDays !== null && dueInDays >= 0) {
    return 'REVIEW';
  }
  
  // If dueInDays < 0 but status is not OVERDUE, keep original status
  // (the business logic may have reasons for not marking as overdue)
  
  return row.status;
};

// Helper: Calculate openAmountAboveThreshold
// Fallback: if openAmountTotal >= threshold, return openAmountTotal, otherwise 0
const getOpenAmountAboveThreshold = (row: MandantRow, threshold: number): number => {
  // In a real app, this would sum individual open positions >= threshold
  // For now, use fallback logic: if total >= threshold, show total, else 0
  return row.openAmountTotal >= threshold ? row.openAmountTotal : 0;
};

// Helper: Format relative date
const formatRelativeDate = (isoDate: string): string => {
  const date = parseISO(isoDate);
  
  if (isToday(date)) {
    return 'heute';
  }
  
  if (isYesterday(date)) {
    return 'gestern';
  }
  
  const daysDiff = differenceInDays(new Date(), date);
  
  if (daysDiff < 7) {
    return `vor ${daysDiff} Tagen`;
  }
  
  if (daysDiff < 30) {
    const weeks = Math.floor(daysDiff / 7);
    return `vor ${weeks} Woche${weeks > 1 ? 'n' : ''}`;
  }
  
  return format(date, 'd. MMM', { locale: de });
};

// Helper: Get action label based on status
const getActionLabel = (status: MandantStatus, missingCount: number): string => {
  switch (status) {
    case 'OVERDUE':
      return 'Belege anfordern';
    case 'WAITING':
      return 'Nachfassen';
    case 'REVIEW':
      return 'Prüfen & freigeben';
    case 'READY':
      return 'Übergabe / Export';
    default:
      return missingCount > 0 ? 'Belege anfordern' : 'Prüfen';
  }
};

// Helper: Check if activity was today (for filter)
const isActivityToday = (isoDate: string): boolean => {
  return isToday(parseISO(isoDate));
};

// Materiality threshold (configurable)
const MATERIALITY_THRESHOLD = 40;

// Filter tags - reduced to non-KPI duplicates only
const filterTags = [
  { id: 'heute', label: 'Aktivität heute', description: 'Aktivität heute' },
  { id: 'ohne-beleg', label: 'Belege fehlen', description: 'Fehlende Belege' },
];

// KPI filter definitions
const kpiFilters = [
  { id: 'kpi-ueberfaellig', label: 'Überfällig', icon: AlertTriangle, colorClass: 'text-destructive', tooltip: undefined },
  { id: 'kpi-fehlende', label: `Offen ≥ ${MATERIALITY_THRESHOLD}€`, icon: FileQuestion, colorClass: 'text-orange-600', tooltip: `Mandanten mit relevanter offener Summe ab ${MATERIALITY_THRESHOLD}€.` },
  { id: 'kpi-unsicher', label: 'Zuordnung unsicher', icon: HelpCircle, colorClass: 'text-yellow-600', tooltip: undefined },
  { id: 'kpi-warten', label: 'Warten auf Mandant', icon: Clock, colorClass: 'text-muted-foreground', tooltip: undefined },
];

// Priority order for sorting (lower = higher priority)
const STATUS_PRIORITY: Record<MandantStatus, number> = {
  OVERDUE: 1,    // höchste Priorität
  WAITING: 2,    // mittel (Reminder fällig)
  REVIEW: 3,     // mittel (nach Betrag)
  READY: 4,      // niedrig
};


// Quick actions
const schnellaktionen = [
  { id: 'belege-anfordern', label: 'Belege anfordern', color: 'text-orange-600' },
  { id: 'auto-bestaetigung', label: 'Auto-Bestätigung', color: 'text-blue-600' },
  { id: 'regeln', label: 'Regeln', color: 'text-purple-600' },
];

// Event types with filter logic
type EventType = 'neue-uploads' | 'neue-antworten' | 'abweichungen' | 'anforderungen' | 'auto-bestaetigung';

interface HeuteEvent {
  id: EventType;
  label: string;
  color: string;
  count: number;
  time?: string;
  filterFn: (m: MandantRow) => boolean;
}

const createInitialEvents = (data: MandantRow[]): HeuteEvent[] => [
  {
    id: 'neue-uploads',
    label: 'Neue Uploads',
    color: 'text-green-600',
    count: data.filter(m => m.hasNewUpload && m.status === 'REVIEW').length,
    time: 'heute',
    filterFn: (m) => m.hasNewUpload && m.status === 'REVIEW',
  },
  {
    id: 'neue-antworten',
    label: 'Neue Antworten',
    color: 'text-green-600',
    count: data.filter(m => m.hasNewAnswer && m.status === 'WAITING').length,
    time: 'heute',
    filterFn: (m) => m.hasNewAnswer,
  },
  {
    id: 'abweichungen',
    label: 'Abweichungen',
    color: 'text-red-600',
    count: data.filter(m => m.hasDeviation || m.riskFlag).length,
    time: 'heute',
    filterFn: (m) => m.hasDeviation || m.riskFlag || m.unsureCount > 0,
  },
  {
    id: 'anforderungen',
    label: 'Anforderungen gesendet',
    color: 'text-orange-600',
    count: 0,
    filterFn: () => false, // Will be set dynamically
  },
  {
    id: 'auto-bestaetigung',
    label: 'Auto-Bestätigung',
    color: 'text-blue-600',
    count: 0,
    filterFn: () => false, // Will be set dynamically
  },
];

export default function Arbeitskorb() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>(['heute']);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [mandanten, setMandanten] = useState<MandantRow[]>(mandantenData);
  const [heutePassiert, setHeutePassiert] = useState<HeuteEvent[]>(() => createInitialEvents(mandantenData));
  const [belegeDialogOpen, setBelegeDialogOpen] = useState(false);
  const [autoBestaetigungDialogOpen, setAutoBestaetigungDialogOpen] = useState(false);
  const [activeEventFilter, setActiveEventFilter] = useState<EventType | null>(null);
  
  // Track mandant IDs affected by actions (for event filtering)
  const [anforderungMandantIds, setAnforderungMandantIds] = useState<string[]>([]);
  const [autoBestaetigungMandantIds, setAutoBestaetigungMandantIds] = useState<string[]>([]);

  const toggleFilter = (filterId: string) => {
    setActiveFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(f => f !== filterId)
        : [...prev, filterId]
    );
  };

  // Separate chip filters from KPI filters
  const chipFilters = activeFilters.filter(f => !f.startsWith('kpi-'));
  const activeKpiFilters = activeFilters.filter(f => f.startsWith('kpi-'));

  // Helper: check if mandant matches a chip filter
  const matchesChipFilter = (m: MandantRow, filterId: string): boolean => {
    switch (filterId) {
      case 'heute':
        return isActivityToday(m.lastActivityAt);
      case 'ueberfaellig':
        return m.status === 'OVERDUE';
      case 'warten':
        return m.status === 'WAITING';
      case '40euro':
        // Filter based on openAmountAboveThreshold > 0
        return getOpenAmountAboveThreshold(m, MATERIALITY_THRESHOLD) > 0;
      case 'ohne-beleg':
        return m.missingCount > 0;
      default:
        return false;
    }
  };

  // Helper: check if mandant matches a KPI filter
  const matchesKpiFilter = (m: MandantRow, kpiId: string): boolean => {
    switch (kpiId) {
      case 'kpi-ueberfaellig':
        return m.status === 'OVERDUE';
      case 'kpi-fehlende':
        // "Fehlende > 40€": missingCount > 0 AND openAmountAboveThreshold > 0
        return m.missingCount > 0 && getOpenAmountAboveThreshold(m, MATERIALITY_THRESHOLD) > 0;
      case 'kpi-unsicher':
        return m.unsureCount > 0;
      case 'kpi-warten':
        return m.status === 'WAITING';
      default:
        return false;
    }
  };

  // Filter and sort mandanten
  const filteredMandanten = useMemo(() => {
    let result = [...mandanten];

    // Apply event filter first if active
    if (activeEventFilter) {
      const eventDef = heutePassiert.find(e => e.id === activeEventFilter);
      if (eventDef) {
        // Special handling for action-based events
        if (activeEventFilter === 'anforderungen') {
          result = result.filter(m => anforderungMandantIds.includes(m.id));
        } else if (activeEventFilter === 'auto-bestaetigung') {
          result = result.filter(m => autoBestaetigungMandantIds.includes(m.id));
        } else {
          result = result.filter(eventDef.filterFn);
        }
      }
    }

    // Filter by chip tags (AND logic for different categories, but chips act as OR within their own selection)
    if (chipFilters.length > 0 && !activeEventFilter) {
      result = result.filter(m => 
        chipFilters.some(filter => matchesChipFilter(m, filter))
      );
    }

    // Filter by search query (case-insensitive on name)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.clientName.toLowerCase().includes(query)
      );
    }

    // Apply KPI filters (OR logic among KPIs)
    if (activeKpiFilters.length > 0 && !activeEventFilter) {
      result = result.filter(m => 
        activeKpiFilters.some(kpi => matchesKpiFilter(m, kpi))
      );
    }

    // Sort by dueInDays (overdue first, then soon due), then by openAmountAboveThreshold descending
    result.sort((a, b) => {
      // Primary: sort by dueInDays ascending (most overdue first)
      const dueA = getDueInDays(a) ?? Infinity; // null = no due date, sort last
      const dueB = getDueInDays(b) ?? Infinity;
      if (dueA !== dueB) {
        return dueA - dueB;
      }
      
      // Secondary: sort by openAmountAboveThreshold descending
      const amountA = getOpenAmountAboveThreshold(a, MATERIALITY_THRESHOLD);
      const amountB = getOpenAmountAboveThreshold(b, MATERIALITY_THRESHOLD);
      return amountB - amountA;
    });

    return result;
  }, [mandanten, chipFilters, activeKpiFilters, searchQuery, activeEventFilter, heutePassiert, anforderungMandantIds, autoBestaetigungMandantIds]);

  // Calculate KPI values based on filtered data (after chip filters + search, before KPI filters)
  const kpiValues = useMemo(() => {
    // Base for KPI calculation: apply chip filters + search, but NOT KPI filters
    let baseData = [...mandanten];

    if (chipFilters.length > 0) {
      baseData = baseData.filter(m => 
        chipFilters.some(filter => matchesChipFilter(m, filter))
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      baseData = baseData.filter(m => 
        m.clientName.toLowerCase().includes(query)
      );
    }

    return {
      'kpi-ueberfaellig': baseData.filter(m => matchesKpiFilter(m, 'kpi-ueberfaellig')).length,
      'kpi-fehlende': baseData.filter(m => matchesKpiFilter(m, 'kpi-fehlende')).length,
      'kpi-unsicher': baseData.filter(m => matchesKpiFilter(m, 'kpi-unsicher')).length,
      'kpi-warten': baseData.filter(m => matchesKpiFilter(m, 'kpi-warten')).length,
    };
  }, [mandanten, chipFilters, searchQuery]);

  // Generate filter label text (only chip filters, not KPIs)
  const activeFilterLabels = chipFilters.map(id => 
    filterTags.find(t => t.id === id)?.label
  ).filter(Boolean);
  
  const activeKpiLabels = activeKpiFilters.map(id => 
    kpiFilters.find(k => k.id === id)?.label
  ).filter(Boolean);
  
  const allActiveLabels = [...activeFilterLabels, ...activeKpiLabels].join(' + ');

  const toggleRowSelection = (id: string) => {
    setSelectedRows(prev =>
      prev.includes(id)
        ? prev.filter(r => r !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    const allFilteredIds = filteredMandanten.map(m => m.id);
    const allSelected = allFilteredIds.every(id => selectedRows.includes(id));
    
    if (allSelected) {
      // Deselect all filtered
      setSelectedRows(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      // Select all filtered
      setSelectedRows(prev => [...new Set([...prev, ...allFilteredIds])]);
    }
  };

  const clearSelection = () => {
    setSelectedRows([]);
  };

  // Check if all filtered rows are selected
  const allFilteredSelected = filteredMandanten.length > 0 && 
    filteredMandanten.every(m => selectedRows.includes(m.id));
  const someFilteredSelected = filteredMandanten.some(m => selectedRows.includes(m.id));

  // Count of selected rows that are in current filter
  const selectedInCurrentFilter = selectedRows.filter(id => 
    filteredMandanten.some(m => m.id === id)
  ).length;

  // Get mandanten for dialog (selected or all filtered)
  const mandantenForAction = useMemo(() => {
    if (selectedInCurrentFilter > 0) {
      return filteredMandanten.filter(m => selectedRows.includes(m.id));
    }
    return filteredMandanten;
  }, [filteredMandanten, selectedRows, selectedInCurrentFilter]);

  // Handle successful send of "Belege anfordern"
  const handleBelegeAnfordernComplete = useCallback((mandantIds: string[]) => {
    // Track affected mandant IDs for event filtering
    setAnforderungMandantIds(prev => [...new Set([...prev, ...mandantIds])]);

    // Update mandanten status to "WAITING"
    setMandanten(prev => prev.map(m => {
      if (mandantIds.includes(m.id)) {
        return {
          ...m,
          status: 'WAITING' as MandantStatus,
          lastRequestAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        };
      }
      return m;
    }));

    // Update "Heute passiert" events
    setHeutePassiert(prev => prev.map(event => {
      if (event.id === 'anforderungen') {
        return { ...event, count: event.count + mandantIds.length };
      }
      return event;
    }));

    // Clear selection after action
    setSelectedRows([]);
  }, []);

  // Handle schnellaktion click
  const handleSchnellaktionClick = (actionId: string) => {
    switch (actionId) {
      case 'belege-anfordern':
        setBelegeDialogOpen(true);
        break;
      case 'auto-bestaetigung':
        setAutoBestaetigungDialogOpen(true);
        break;
      default:
        break;
    }
  };

  // Handle auto-bestätigung complete
  const handleAutoBestaetigungComplete = useCallback((confirmedCount: number, mandantIds: string[]) => {
    // Track affected mandant IDs for event filtering
    setAutoBestaetigungMandantIds(prev => [...new Set([...prev, ...mandantIds])]);

    // Update mandanten to reduce "unsureCount"
    setMandanten(prev => prev.map(m => {
      if (mandantIds.includes(m.id)) {
        const newUnsureCount = Math.max(0, m.unsureCount - Math.ceil(confirmedCount / mandantIds.length));
        return {
          ...m,
          unsureCount: newUnsureCount,
          lastActivityAt: new Date().toISOString(),
          // If no more unsure and no missing, might change status to READY
          ...(newUnsureCount === 0 && m.missingCount === 0 && m.status === 'REVIEW' ? {
            status: 'READY' as MandantStatus,
          } : {}),
        };
      }
      return m;
    }));

    // Update event count
    setHeutePassiert(prev => prev.map(event => {
      if (event.id === 'auto-bestaetigung') {
        return { ...event, count: event.count + confirmedCount };
      }
      return event;
    }));
  }, []);

  // Get status badge variant based on status enum
  const getStatusBadgeVariant = (status: MandantStatus) => {
    switch (status) {
      case 'OVERDUE': return 'destructive';
      case 'WAITING': return 'secondary';
      case 'REVIEW': return 'secondary';
      case 'READY': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <div className="h-full overflow-auto">
      {/* Header - matching Mandanten page */}
      <div className="border-b bg-card px-6 py-6">
        <div className="max-w-[1720px]">
          <h1 className="text-2xl font-semibold text-foreground">Arbeitskorb</h1>
          <p className="text-muted-foreground mt-1">
            Verwalten Sie offene Aufgaben und Mandanten mit Handlungsbedarf
          </p>
        </div>
      </div>

      <div className="max-w-[1720px] p-6 space-y-6">
        {/* Search and Filter Row */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Suche..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {filterTags.map(tag => (
              <Button
                key={tag.id}
                variant={activeFilters.includes(tag.id) && !activeEventFilter ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setActiveEventFilter(null); // Clear event filter when using chip filters
                  toggleFilter(tag.id);
                }}
                className="gap-1"
              >
                {tag.label}
                {activeFilters.includes(tag.id) && !activeEventFilter && <Check className="h-3 w-3" />}
              </Button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('list')}
            >
              <ListFilter className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
              size="icon"
              className="h-8 w-8"
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Active Filters Bar */}
        {(activeFilters.length > 0 || activeEventFilter) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Aktive Filter:</span>
            {activeEventFilter && (
              <Badge 
                variant="secondary" 
                className="gap-1 cursor-pointer hover:bg-secondary/80"
                onClick={() => setActiveEventFilter(null)}
              >
                {heutePassiert.find(e => e.id === activeEventFilter)?.label}
                <X className="h-3 w-3" />
              </Badge>
            )}
            {!activeEventFilter && activeFilters.map(filterId => {
              // Find label from filterTags or kpiFilters
              const chipFilter = filterTags.find(t => t.id === filterId);
              const kpiFilter = kpiFilters.find(k => k.id === filterId);
              const label = chipFilter?.label || kpiFilter?.label || filterId;
              
              return (
                <Badge 
                  key={filterId}
                  variant="secondary" 
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => toggleFilter(filterId)}
                >
                  {label}
                  <X className="h-3 w-3" />
                </Badge>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setActiveFilters([]);
                setActiveEventFilter(null);
              }}
            >
              Alle zurücksetzen
            </Button>
          </div>
        )}

        {/* Dynamic count display */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredMandanten.length} Mandanten</span>
            {activeFilters.length === 0 && !activeEventFilter && ' (kein Filter aktiv)'}
          </span>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpiFilters.map(kpi => {
            const isActive = activeFilters.includes(kpi.id);
            const count = kpiValues[kpi.id as keyof typeof kpiValues];
            const Icon = kpi.icon;
            
            const cardContent = (
              <button
                key={kpi.id}
                onClick={() => toggleFilter(kpi.id)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all text-left w-full",
                  "hover:bg-muted/50",
                  isActive 
                    ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                    : "border-border bg-card"
                )}
              >
                <div className={cn("p-2 rounded-md bg-muted/50", isActive && "bg-primary/10")}>
                  <Icon className={cn("h-4 w-4", kpi.colorClass)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={cn("text-2xl font-bold", kpi.colorClass)}>
                    {count}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {kpi.label}
                  </div>
                </div>
                {isActive && (
                  <Check className="h-4 w-4 text-primary shrink-0" />
                )}
              </button>
            );
            
            // Wrap with tooltip if tooltip exists
            if (kpi.tooltip) {
              return (
                <TooltipProvider key={kpi.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {cardContent}
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{kpi.tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              );
            }
            
            return cardContent;
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* Left: Table */}
          <div className="space-y-4">
            {/* Selection Info Bar */}
            {selectedInCurrentFilter > 0 && (
              <div className="flex items-center gap-3 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg text-sm">
                <span className="font-medium text-primary">
                  Auswahl: {selectedInCurrentFilter}
                </span>
                <button
                  onClick={clearSelection}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3 w-3" />
                  Auswahl aufheben
                </button>
              </div>
            )}

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="w-10 p-3">
                          <Checkbox
                            checked={allFilteredSelected}
                            ref={(el) => {
                              if (el) {
                                const input = el.querySelector('button');
                                if (input) {
                                  (input as any).dataset.state = someFilteredSelected && !allFilteredSelected ? 'indeterminate' : allFilteredSelected ? 'checked' : 'unchecked';
                                }
                              }
                            }}
                            onCheckedChange={toggleSelectAll}
                          />
                        </th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground">Mandant / Monat</th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground">Status</th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground">Frist</th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground">Offene Punkte</th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-1 cursor-help">
                                  Relevante Summe (≥{MATERIALITY_THRESHOLD}€)
                                  <Info className="h-3 w-3 text-muted-foreground/60" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Summe offener Posten ab Materialitätsschwelle (Standard: {MATERIALITY_THRESHOLD}€).</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground hidden lg:table-cell">Letzte Interaktion</th>
                        <th className="text-left p-3 font-medium text-sm text-muted-foreground w-40">Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMandanten.map(row => (
                        <tr 
                          key={row.id} 
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={selectedRows.includes(row.id)}
                              onCheckedChange={() => toggleRowSelection(row.id)}
                            />
                          </td>
                          {/* Mandant / Monat combined */}
                          <td className="p-3">
                            <div className="flex flex-col">
                              <button
                                onClick={() => navigate(`/kanzlei/mandant/${row.id}`)}
                                className="font-medium text-primary hover:underline text-left"
                              >
                                {row.clientName}
                              </button>
                              <span className="text-xs text-muted-foreground">{row.monthLabel}</span>
                            </div>
                          </td>
                          {/* Status */}
                          <td className="p-3">
                            {(() => {
                              const effectiveStatus = getEffectiveStatus(row);
                              return (
                                <Badge variant={getStatusBadgeVariant(effectiveStatus)}>
                                  {STATUS_DISPLAY[effectiveStatus].label}
                                </Badge>
                              );
                            })()}
                          </td>
                          {/* Frist */}
                          <td className="p-3 text-sm">
                            {(() => {
                              const dueInDays = getDueInDays(row);
                              const { text, colorClass } = formatDueDate(dueInDays);
                              return <span className={colorClass}>{text}</span>;
                            })()}
                          </td>
                          {/* Offen - Chips breakdown */}
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {row.missingCount > 0 && (
                                <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
                                  Belege fehlen ({row.missingCount})
                                </Badge>
                              )}
                              {row.unsureCount > 0 && (
                                <Badge className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400">
                                  Zuordnung unsicher ({row.unsureCount})
                                </Badge>
                              )}
                              {/* Show pending chip for WAITING status */}
                              {row.status === 'WAITING' && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {row.requestedItemsCount && row.requestedItemsCount > 0
                                    ? `Anforderung offen (${row.requestedItemsCount})`
                                    : 'Antwort ausstehend'}
                                </Badge>
                              )}
                              {/* Show dash only if no chips at all */}
                              {row.missingCount === 0 && row.unsureCount === 0 && row.status !== 'WAITING' && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          {/* Offen € - shows openAmountAboveThreshold with tooltip fallback */}
                          <td className="p-3 font-medium">
                            {(() => {
                              const amountAboveThreshold = getOpenAmountAboveThreshold(row, MATERIALITY_THRESHOLD);
                              const hasOpenItems = row.missingCount > 0 || row.unsureCount > 0;
                              
                              if (amountAboveThreshold > 0) {
                                return `${amountAboveThreshold.toLocaleString('de-DE')} €`;
                              }
                              
                              // Show dash with tooltip if there are open items but no amount above threshold
                              if (hasOpenItems) {
                                return (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="text-muted-foreground cursor-help">—</span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Betrag nicht ermittelbar oder unter {MATERIALITY_THRESHOLD}€.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              }
                              
                              return <span className="text-muted-foreground">—</span>;
                            })()}
                          </td>
                          {/* Letzte Interaktion - hidden on small screens */}
                          <td className="p-3 text-sm hidden lg:table-cell">
                            <div className="flex flex-col">
                              {row.lastActivityAt && row.lastActivityActor ? (
                                <span className="text-muted-foreground">
                                  {row.lastActivityActor === 'MANDANT' ? 'Mandant' : 'Kanzlei'}: {formatRelativeDate(row.lastActivityAt)}
                                </span>
                              ) : row.lastActivityAt ? (
                                <span className="text-muted-foreground">
                                  {formatRelativeDate(row.lastActivityAt)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {row.status === 'WAITING' && row.lastRequestAt && (
                                <span className="text-xs text-orange-600">
                                  Kanzlei: Anforderung {formatRelativeDate(row.lastRequestAt)}
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Aktion */}
                          <td className="p-3">
                            <Button variant="outline" size="sm" className="whitespace-nowrap">
                              {getActionLabel(row.status, row.missingCount)}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-4">
            {/* Selection Context Info */}
            {selectedInCurrentFilter > 0 && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 text-center">
                Aktionen beziehen sich auf <span className="font-semibold text-foreground">{selectedInCurrentFilter} ausgewählte</span> Mandanten
              </div>
            )}

            {/* Schnellaktionen */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold underline underline-offset-4">
                  Schnellaktionen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {schnellaktionen.map((action, idx) => {
                  const targetCount = selectedInCurrentFilter > 0 
                    ? selectedInCurrentFilter 
                    : filteredMandanten.length;
                  
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleSchnellaktionClick(action.id)}
                      className={cn(
                        "flex items-center justify-between gap-2 w-full text-left hover:underline text-sm",
                        action.color
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-current" />
                        {action.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({targetCount})
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Heute passiert */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold underline underline-offset-4">
                    Heute passiert
                  </CardTitle>
                  {activeEventFilter && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveEventFilter(null)}
                      className="h-6 px-2 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Filter
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                {heutePassiert
                  .filter(event => event.count > 0)
                  .map((event) => (
                    <button
                      key={event.id}
                      onClick={() => {
                        if (activeEventFilter === event.id) {
                          setActiveEventFilter(null);
                        } else {
                          setActiveEventFilter(event.id);
                          // Clear other filters when event filter is active
                          setActiveFilters([]);
                        }
                      }}
                      className={cn(
                        "flex items-center justify-between gap-2 w-full text-sm p-2 rounded-md transition-colors",
                        event.color,
                        activeEventFilter === event.id 
                          ? "bg-primary/10 ring-1 ring-primary/30" 
                          : "hover:bg-muted/50"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-current" />
                        {event.label}
                        {event.time && (
                          <span className="text-xs text-muted-foreground font-normal">
                            ({event.time})
                          </span>
                        )}
                      </span>
                      <Badge 
                        variant={activeEventFilter === event.id ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        {event.count}
                      </Badge>
                    </button>
                  ))}
                {heutePassiert.every(e => e.count === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    Noch keine Ereignisse heute
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Belege Anfordern Dialog */}
      <BelegeAnfordernDialog
        open={belegeDialogOpen}
        onOpenChange={setBelegeDialogOpen}
        mandanten={mandantenForAction}
        materialityThreshold={MATERIALITY_THRESHOLD}
        onSendComplete={handleBelegeAnfordernComplete}
      />

      {/* Auto-Bestätigung Dialog */}
      <AutoBestaetigungDialog
        open={autoBestaetigungDialogOpen}
        onOpenChange={setAutoBestaetigungDialogOpen}
        mandanten={mandantenForAction}
        onApplyComplete={handleAutoBestaetigungComplete}
      />
    </div>
  );
}
