import { useState, useMemo } from 'react';
import { Sparkles, Check, AlertCircle, SlidersHorizontal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Types
interface UncertainMatch {
  id: string;
  mandantId: string;
  mandantName: string;
  datum: string;
  betrag: number;
  belegBetrag: number;
  gegenpartei: string;
  matchScore: number; // 0-100
  ocrScore: number; // 0-100
  dateDiffDays: number;
}

interface Mandant {
  id: string;
  clientName: string;
  monthLabel: string;
  status: string;
  openAmountTotal: number;
  missingCount: number;
  unsureCount: number;
}

interface AutoBestaetigungDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mandanten: Mandant[];
  onApplyComplete?: (confirmedCount: number, mandantIds: string[]) => void;
}

// Mock uncertain matches per mandant
const getUncertainMatchesForMandant = (mandantId: string, clientName: string): UncertainMatch[] => {
  const mockMatches: Record<string, Partial<UncertainMatch>[]> = {
    'hoffmann-consult': [
      { datum: '05.12.2025', betrag: 85.50, belegBetrag: 85.50, gegenpartei: 'Office Depot', matchScore: 92, ocrScore: 95, dateDiffDays: 0 },
      { datum: '12.12.2025', betrag: 24.50, belegBetrag: 24.99, gegenpartei: 'Bürobedarf Online', matchScore: 78, ocrScore: 88, dateDiffDays: 1 },
    ],
    'it-solutions': [
      { datum: '08.11.2025', betrag: 120.00, belegBetrag: 120.00, gegenpartei: 'Amazon AWS', matchScore: 98, ocrScore: 99, dateDiffDays: 0 },
      { datum: '15.11.2025', betrag: 45.00, belegBetrag: 45.00, gegenpartei: 'GitHub', matchScore: 95, ocrScore: 97, dateDiffDays: 0 },
      { datum: '22.11.2025', betrag: 89.90, belegBetrag: 90.00, gegenpartei: 'DigitalOcean', matchScore: 82, ocrScore: 75, dateDiffDays: 2 },
      { datum: '28.11.2025', betrag: 65.00, belegBetrag: 65.00, gegenpartei: 'JetBrains', matchScore: 96, ocrScore: 98, dateDiffDays: 0 },
    ],
    'weber-handwerk': [
      { datum: '10.11.2025', betrag: 75.00, belegBetrag: 75.00, gegenpartei: 'Baumarkt Müller', matchScore: 88, ocrScore: 82, dateDiffDays: 1 },
    ],
  };

  const matches = mockMatches[mandantId] || [];
  return matches.map((m, idx) => ({
    id: `${mandantId}-match-${idx}`,
    mandantId,
    mandantName: clientName,
    datum: m.datum || '',
    betrag: m.betrag || 0,
    belegBetrag: m.belegBetrag || 0,
    gegenpartei: m.gegenpartei || '',
    matchScore: m.matchScore || 0,
    ocrScore: m.ocrScore || 0,
    dateDiffDays: m.dateDiffDays || 0,
  }));
};

export function AutoBestaetigungDialog({
  open,
  onOpenChange,
  mandanten,
  onApplyComplete,
}: AutoBestaetigungDialogProps) {
  // Settings state
  const [matchThreshold, setMatchThreshold] = useState(85);
  const [ocrThresholdEnabled, setOcrThresholdEnabled] = useState(true);
  const [ocrThreshold, setOcrThreshold] = useState(80);
  const [exactAmountOnly, setExactAmountOnly] = useState(false);
  const [maxDateDiffEnabled, setMaxDateDiffEnabled] = useState(true);
  const [maxDateDiff, setMaxDateDiff] = useState(3);
  const [isApplying, setIsApplying] = useState(false);

  // Get all uncertain matches for relevant mandanten
  const allMatches = useMemo(() => {
    return mandanten
      .filter(m => m.unsureCount > 0)
      .flatMap(m => getUncertainMatchesForMandant(m.id, m.clientName));
  }, [mandanten]);

  // Filter matches based on current settings
  const eligibleMatches = useMemo(() => {
    return allMatches.filter(match => {
      // Match score threshold
      if (match.matchScore < matchThreshold) return false;
      
      // OCR score threshold
      if (ocrThresholdEnabled && match.ocrScore < ocrThreshold) return false;
      
      // Exact amount only
      if (exactAmountOnly && match.betrag !== match.belegBetrag) return false;
      
      // Date difference
      if (maxDateDiffEnabled && match.dateDiffDays > maxDateDiff) return false;
      
      return true;
    });
  }, [allMatches, matchThreshold, ocrThresholdEnabled, ocrThreshold, exactAmountOnly, maxDateDiffEnabled, maxDateDiff]);

  // Group by mandant for display
  const matchesByMandant = useMemo(() => {
    const grouped: Record<string, { mandantName: string; matches: UncertainMatch[] }> = {};
    eligibleMatches.forEach(match => {
      if (!grouped[match.mandantId]) {
        grouped[match.mandantId] = { mandantName: match.mandantName, matches: [] };
      }
      grouped[match.mandantId].matches.push(match);
    });
    return grouped;
  }, [eligibleMatches]);

  const affectedMandantIds = Object.keys(matchesByMandant);
  const totalAmount = eligibleMatches.reduce((sum, m) => sum + m.betrag, 0);

  const handleApply = async () => {
    if (eligibleMatches.length === 0) return;
    
    setIsApplying(true);
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 1200));
    
    toast.success(
      `${eligibleMatches.length} Matches automatisch bestätigt`,
      {
        description: `${affectedMandantIds.length} Mandant${affectedMandantIds.length > 1 ? 'en' : ''} betroffen (${totalAmount.toFixed(2)}€)`,
      }
    );

    onApplyComplete?.(eligibleMatches.length, affectedMandantIds);
    setIsApplying(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            Auto-Bestätigung
          </DialogTitle>
          <DialogDescription>
            Bestätige automatisch Matches basierend auf Schwellenwerten und Regeln
          </DialogDescription>
        </DialogHeader>

        {/* Settings Section */}
        <div className="space-y-4 py-2">
          {/* Match Score Threshold */}
          <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Match-Score Schwelle</Label>
              <Badge variant="secondary" className="font-mono">
                ≥ {matchThreshold}%
              </Badge>
            </div>
            <Slider
              value={[matchThreshold]}
              onValueChange={([val]) => setMatchThreshold(val)}
              min={50}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Nur Matches mit einem Score von mindestens {matchThreshold}% werden bestätigt
            </p>
          </div>

          {/* Exclusion Toggles */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              Zusätzliche Filter
            </div>

            {/* OCR Score Filter */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="ocr-filter"
                    checked={ocrThresholdEnabled}
                    onCheckedChange={setOcrThresholdEnabled}
                  />
                  <Label htmlFor="ocr-filter" className="text-sm cursor-pointer">
                    OCR/Parsing Score ≥
                  </Label>
                  <Input
                    type="number"
                    value={ocrThreshold}
                    onChange={(e) => setOcrThreshold(Number(e.target.value))}
                    disabled={!ocrThresholdEnabled}
                    className="w-16 h-7 text-sm"
                    min={0}
                    max={100}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            </div>

            {/* Exact Amount Filter */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-2">
                <Switch
                  id="exact-amount"
                  checked={exactAmountOnly}
                  onCheckedChange={setExactAmountOnly}
                />
                <Label htmlFor="exact-amount" className="text-sm cursor-pointer">
                  Nur wenn Betrag exakt übereinstimmt
                </Label>
              </div>
            </div>

            {/* Date Difference Filter */}
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id="date-diff"
                    checked={maxDateDiffEnabled}
                    onCheckedChange={setMaxDateDiffEnabled}
                  />
                  <Label htmlFor="date-diff" className="text-sm cursor-pointer">
                    Datum-Differenz max
                  </Label>
                  <Input
                    type="number"
                    value={maxDateDiff}
                    onChange={(e) => setMaxDateDiff(Number(e.target.value))}
                    disabled={!maxDateDiffEnabled}
                    className="w-16 h-7 text-sm"
                    min={0}
                    max={30}
                  />
                  <span className="text-sm text-muted-foreground">Tage</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Preview Section */}
        <div className="flex-1 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">Vorschau</h4>
            <div className="flex items-center gap-2">
              {eligibleMatches.length > 0 ? (
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  <Check className="h-3 w-3 mr-1" />
                  {eligibleMatches.length} Matches werden bestätigt
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-muted-foreground">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Keine Matches erfüllen die Kriterien
                </Badge>
              )}
            </div>
          </div>

          {eligibleMatches.length > 0 ? (
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-3">
                {Object.entries(matchesByMandant).map(([mandantId, { mandantName, matches }]) => (
                  <div key={mandantId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{mandantName}</span>
                      <span className="text-xs text-muted-foreground">
                        {matches.length} Match{matches.length > 1 ? 'es' : ''}
                      </span>
                    </div>
                    <div className="bg-muted/30 rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2 font-medium text-muted-foreground">Datum</th>
                            <th className="text-right p-2 font-medium text-muted-foreground">Betrag</th>
                            <th className="text-left p-2 font-medium text-muted-foreground">Gegenpartei</th>
                            <th className="text-center p-2 font-medium text-muted-foreground">Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matches.map(match => (
                            <tr key={match.id} className="border-b last:border-0">
                              <td className="p-2 text-muted-foreground">{match.datum}</td>
                              <td className="p-2 text-right">
                                <span className="font-medium">{match.betrag.toFixed(2)}€</span>
                                {match.betrag !== match.belegBetrag && (
                                  <span className="text-orange-600 ml-1">
                                    (Beleg: {match.belegBetrag.toFixed(2)}€)
                                  </span>
                                )}
                              </td>
                              <td className="p-2">{match.gegenpartei}</td>
                              <td className="p-2 text-center">
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-xs",
                                    match.matchScore >= 90 && "border-green-500 text-green-700",
                                    match.matchScore >= 80 && match.matchScore < 90 && "border-yellow-500 text-yellow-700",
                                    match.matchScore < 80 && "border-orange-500 text-orange-700"
                                  )}
                                >
                                  {match.matchScore}%
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              Passe die Schwellenwerte an, um Matches zu finden
            </div>
          )}
        </div>

        {/* Summary */}
        {eligibleMatches.length > 0 && (
          <div className="flex items-center gap-4 py-2 px-3 bg-green-50 border border-green-200 rounded-lg text-sm">
            <Sparkles className="h-4 w-4 text-green-600" />
            <div className="flex-1">
              <span className="font-medium text-green-800">
                {eligibleMatches.length} von {allMatches.length} Matches
              </span>
              <span className="text-green-700 mx-1">werden bestätigt</span>
              <span className="text-green-600">
                ({affectedMandantIds.length} Mandant{affectedMandantIds.length > 1 ? 'en' : ''}, {totalAmount.toFixed(2)}€)
              </span>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <p className="text-xs text-muted-foreground">
              Nach Anwendung: „Unsicher" KPI wird reduziert
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={handleApply} 
                disabled={isApplying || eligibleMatches.length === 0}
                className="gap-2"
              >
                {isApplying ? (
                  <>Wird angewendet...</>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Bestätigen
                    {eligibleMatches.length > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {eligibleMatches.length}
                      </Badge>
                    )}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
