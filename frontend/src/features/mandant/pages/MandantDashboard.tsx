import { useNavigate } from 'react-router-dom';
import { useBelegStore } from '@/store/belegStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, ChevronRight, ChevronDown, CheckCircle2, Eye, Upload, AlertCircle } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState, useEffect } from 'react';
import { getMyTenantId, loadProcessedMonths } from '@/lib/documentApi';

const GERMAN_IDS = ['januar','februar','maerz','april','mai','juni','juli','august','september','oktober','november','dezember'];
const GERMAN_LABELS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

function getMonthLabel(id: string): string {
  const parts = id.split('-');
  const year = parts[parts.length - 1];
  const key = parts.slice(0, -1).join('-');
  const idx = GERMAN_IDS.indexOf(key);
  return idx >= 0 ? `${GERMAN_LABELS[idx]} ${year}` : id;
}

// Priority mapping for packages - "Wichtig" = dringend
const URGENT_PACKAGES = ['top_amounts'] as const;

export default function MandantDashboard() {
  const navigate = useNavigate();
  const { counts, packageCounts } = useBelegStore();
  const [isOptionalOpen, setIsOptionalOpen] = useState(false);
  const [processedMonths, setProcessedMonths] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    getMyTenantId()
      .then(tenantId => loadProcessedMonths(tenantId))
      .then(months => { if (active) setProcessedMonths(months); })
      .catch(() => { /* kein Tenant oder keine Transaktionen */ });
    return () => { active = false; };
  }, []);

  const currentMonthId = processedMonths[0];
  const currentMonthLabel = currentMonthId ? getMonthLabel(currentMonthId) : null;
  const pastMonthIds = processedMonths.slice(1);

  // Calculate total open tasks (gesamt)
  const gesamtCount = (packageCounts.top_amounts || 0) + 
                      (packageCounts.other_open || 0) + 
                      (packageCounts.bundles || 0) + 
                      (packageCounts.subscriptions || 0) + 
                      (packageCounts.refunds || 0) + 
                      (packageCounts.small_no_receipt || 0);
  
  // Calculate urgent tasks (dringend) - only "Wichtig" priority packages
  const dringendCount = packageCounts.top_amounts || 0;
  
  // Uncertain matches for optional review
  const uncertainTotal = counts.uncertain || 0;
  
  // Auto-quote calculation: confident + resolved vs total
  const totalTransactions = counts.total || 1;
  const autoMatched = counts.confident + counts.resolved;
  const autoQuote = Math.round((autoMatched / totalTransactions) * 100);
  const hasReliableAutoQuote = totalTransactions > 10; // Only show % if enough data

  const handleTasksClick = () => {
    navigate('/mandant-wizard');
  };

  const handleReviewClick = () => {
    navigate(`/mandant/monat/${currentMonthId ?? 'neu'}/unsichere-matches`);
  };

  const handleHandoverClick = () => {
    navigate('/mandant/uebergabe');
  };

  const handleAddMonth = () => {
    navigate('/mandant/monat/neu');
  };

  const handlePastMonthClick = (monthId: string) => {
    navigate(`/mandant/monat/${monthId}/abschluss`);
  };

  return (
    <div className="space-y-fluid-lg">
      {/* Header */}
      <div className="flex items-start justify-between gap-fluid-md">
        <div>
          <h1 className="text-fluid-2xl font-semibold mb-2">Monatsübersicht</h1>
          <p className="text-muted-foreground text-fluid-base">
            Wähle einen Monat oder starte einen neuen.
          </p>
        </div>
        <Button onClick={handleAddMonth} variant="outline" size="lg" className="shrink-0 text-fluid-base px-fluid-lg">
          <Plus className="mr-2 h-5 w-5" /> Monat hinzufügen
        </Button>
      </div>

      {/* Current Month Card */}
      {currentMonthLabel && (
      <Card className="border-l-4 border-l-primary">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-fluid-xl">{currentMonthLabel}</CardTitle>
            <Button
              onClick={() => navigate(`/mandant/monat/${currentMonthId}/setup`)}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <Upload className="mr-2 h-4 w-4" /> Weitere Dokumente hochladen
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-confident))]" />
            <span className="text-fluid-sm text-muted-foreground">Die Vollständigkeitsprüfung war erfolgreich</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-fluid-lg">
          {/* Section A: Unklare Banktransaktionen */}
          {gesamtCount > 0 && (
            <div className="border rounded-lg p-fluid-md">
              <div className="flex items-start justify-between gap-4">
                {/* Left side: Text content */}
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-[hsl(var(--status-missing))]" />
                    <h3 className="font-semibold text-fluid-base">
                      Es gibt noch unklare Banktransaktionen
                    </h3>
                  </div>
                  
                  <p className="text-fluid-sm text-muted-foreground">
                    Einige Banktransaktionen benötigen noch eine Klärung, damit der Monat vollständig ist.
                  </p>

                  {/* Hint about Kanzlei handover */}
                  <p className="text-fluid-sm text-muted-foreground">
                    Hinweis: Du kannst die Bearbeitung auch{' '}
                    <button 
                      onClick={handleHandoverClick}
                      className="font-medium underline hover:no-underline"
                    >
                      direkt an deine Kanzlei übergeben
                    </button>. Die Kanzlei übernimmt die weitere Bearbeitung.
                  </p>
                </div>

                {/* Right side: CTA Button */}
                <Button 
                  onClick={handleTasksClick} 
                  className="bg-[hsl(var(--status-missing))] hover:bg-[hsl(var(--status-missing))]/90 text-white shrink-0"
                >
                  Offene Punkte ansehen
                </Button>
              </div>
            </div>
          )}

          {/* Separator */}
          <Separator />

          {/* Section B: Optional - Automatische Zuordnung prüfen */}
          <Collapsible open={isOptionalOpen} onOpenChange={setIsOptionalOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -mx-2 px-2 py-2 rounded-md transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-muted">
                    <Eye className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      Automatische Zuordnung prüfen
                    </span>
                    <Badge variant="secondary" className="text-xs">Optional</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-fluid-sm font-medium text-muted-foreground">
                    {uncertainTotal} Zuordnungen
                  </span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOptionalOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-12 pt-2">
                <p className="text-fluid-sm text-muted-foreground mb-4">
                  Transparenz: Wir zeigen dir, welche Zahlungen wir automatisch zugeordnet haben – du entscheidest, ob alles passt.
                </p>
                <div className="flex flex-wrap gap-fluid-sm">
                  <Button variant="outline" onClick={handleReviewClick} className="text-fluid-sm">
                    Zuordnungen ansehen (optional)
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
      )}

      {/* Past Months Section */}
      {pastMonthIds.length > 0 && (
        <div>
          <h2 className="text-fluid-lg font-medium mb-fluid-sm">Vergangene Monate</h2>
          <div className="flex flex-col gap-fluid-sm">
            {pastMonthIds.map((monthId) => (
              <Card
                key={monthId}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handlePastMonthClick(monthId)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="font-medium">{getMonthLabel(monthId)}</div>
                      <Badge className="bg-[hsl(var(--status-confident))] text-white text-xs px-2 py-0.5">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        abgeschlossen
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}