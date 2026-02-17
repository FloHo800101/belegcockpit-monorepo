import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, FileText, Upload, Check, CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useBelegStore } from '@/store/belegStore';
import { cn } from '@/lib/utils';

// Available months for new month selection
const availableMonths = [
  { id: 'februar-2026', label: 'Februar 2026' },
  { id: 'maerz-2026', label: 'März 2026' },
  { id: 'april-2026', label: 'April 2026' },
];

// Package keys used for open items count (same as OpenItems.tsx)
const PACKAGE_KEYS = ['top_amounts', 'other_open', 'bundles', 'subscriptions', 'refunds', 'small_no_receipt'];

export default function MonthSetup() {
  const navigate = useNavigate();
  // Matching progress states (local, not persisted)
  const [isMatching, setIsMatching] = useState(false);
  const [matchingProgress, setMatchingProgress] = useState(0);
  // For existing month: track if additional receipts were uploaded
  const [additionalBelegeUploaded, setAdditionalBelegeUploaded] = useState(false);
  const [existingMonthMatchingComplete, setExistingMonthMatchingComplete] = useState(false);
  
  const { toast } = useToast();
  const { goToDashboard, goToOpenItems, isNewMonth, monthId, monthLabel } = useWizardNavigation();
  const { packageCounts, wizardSetup, dispatch } = useBelegStore();
  
  // Track if we've already reset the wizard for this session
  const hasResetRef = useRef(false);
  
  // Reset wizard state only once when entering new month setup
  useEffect(() => {
    if (isNewMonth && !hasResetRef.current) {
      hasResetRef.current = true;
      dispatch({ type: 'WIZARD_RESET' });
    }
  }, [isNewMonth, dispatch]);
  
  // Destructure wizard setup from store
  const { selectedMonth, uploadedKontoauszug, uploadedKreditkarte, uploadedBelege, matchingComplete } = wizardSetup;
  
  // Calculate total open items (same logic as OpenItems.tsx)
  const openItemsCount = PACKAGE_KEYS.reduce((sum, key) => sum + (packageCounts[key] || 0), 0);
  
  // Calculate urgent count (top_amounts = important/urgent items)
  const dringendCount = packageCounts.top_amounts || 0;
  
  // Mock auto-match quote (similar to dashboard)
  const autoMatchQuote = 54;

  const setSelectedMonth = (month: string) => {
    dispatch({ type: 'WIZARD_SET_MONTH', payload: month });
  };

  const handleUploadKontoauszug = () => {
    dispatch({ type: 'WIZARD_UPLOAD_KONTOAUSZUG' });
    toast({ title: 'Kontoauszug hochgeladen', description: 'Der Kontoauszug wurde erfolgreich importiert.' });
  };

  const handleUploadKreditkarte = () => {
    dispatch({ type: 'WIZARD_UPLOAD_KREDITKARTE' });
    toast({ title: 'Kreditkartenabrechnung hochgeladen', description: 'Die Kreditkartenabrechnung wurde erfolgreich importiert.' });
  };

  const handleUploadBelege = () => {
    if (isNewMonth) {
      dispatch({ type: 'WIZARD_UPLOAD_BELEGE' });
    } else {
      // For existing month: track locally
      setAdditionalBelegeUploaded(true);
      setExistingMonthMatchingComplete(false); // Reset matching state to allow re-run
    }
    toast({ title: 'Belege hochgeladen', description: 'Die Belege wurden erfolgreich importiert.' });
  };

  // For new month: need all uploads + month selected
  // For existing month: no matching needed, just allow additional uploads
  const canStartMatching = isNewMonth && selectedMonth && uploadedKontoauszug && uploadedBelege;

  // Handle matching progress simulation
  useEffect(() => {
    if (!isMatching) return;
    
    const interval = setInterval(() => {
      setMatchingProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsMatching(false);
          if (isNewMonth) {
            dispatch({ type: 'WIZARD_COMPLETE_MATCHING' });
          } else {
            setExistingMonthMatchingComplete(true);
            setAdditionalBelegeUploaded(false); // Reset upload state after matching
          }
          return 100;
        }
        return prev + 20; // 5 steps = 5 seconds total
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isMatching, dispatch, isNewMonth]);

  const handleStartMatching = () => {
    setIsMatching(true);
    setMatchingProgress(0);
  };

  const handleNext = () => {
    if (isNewMonth && matchingComplete) {
      // Navigate to the newly created month
      navigate(`/mandant/monat/${selectedMonth}/offene-punkte`);
    } else if (!isNewMonth) {
      // Navigate to open items of current month
      goToOpenItems(monthId);
    }
  };

  // ============ EXISTING MONTH MODE ============
  if (!isNewMonth) {
    return (
      <>
        <div className="max-w-lg mx-auto space-y-6">
          <div className="text-center mb-2">
            <h2 className="text-xl font-semibold mb-1">{monthLabel} – Dokumente</h2>
            <p className="text-sm text-muted-foreground">Lade weitere Belege für diesen Monat hoch</p>
          </div>

          {/* Month - Fixed */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Monat
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="font-medium">{monthLabel}</div>
            </CardContent>
          </Card>

          {/* Kontoauszug - Already imported */}
          <Card className="border-[hsl(var(--status-confident))]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Kontoauszug
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Bereits importiert
              </div>
            </CardContent>
          </Card>

          {/* Kreditkartenabrechnung - Already imported */}
          <Card className="border-[hsl(var(--status-confident))]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Kreditkartenabrechnung
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Bereits importiert
              </div>
            </CardContent>
          </Card>

          {/* Belege - Can upload more */}
          <Card className={cn(
            "border-[hsl(var(--status-confident))]",
            additionalBelegeUploaded && "border-primary"
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Belege
                <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />
              </CardTitle>
              <CardDescription>
                {additionalBelegeUploaded ? 'Neue Belege hochgeladen' : '47 Belege importiert'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={handleUploadBelege}>
                <Upload className="mr-2 h-4 w-4" /> Weitere Belege hochladen
              </Button>
            </CardContent>
          </Card>

          {/* Vollständigkeitsprüfung - Show after additional upload */}
          {additionalBelegeUploaded && !isMatching && !existingMonthMatchingComplete && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Vollständigkeitsprüfung</CardTitle>
                <CardDescription>
                  Führe eine erneute Prüfung durch, um die neuen Belege zuzuordnen.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button className="w-full" onClick={handleStartMatching}>
                  Vollständigkeitsprüfung starten <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Progress View */}
          {isMatching && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vollständigkeitsprüfung läuft...
                </CardTitle>
                <CardDescription>
                  Neue Belege werden den Transaktionen zugeordnet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={matchingProgress} className="h-2" />
                <div className="text-sm text-muted-foreground text-center">
                  {matchingProgress}% abgeschlossen
                </div>
              </CardContent>
            </Card>
          )}

          {/* Result View */}
          {existingMonthMatchingComplete && (
            <Card className="border-[hsl(var(--status-confident))] bg-[hsl(var(--status-confident))]/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-[hsl(var(--status-confident))]">
                  <CheckCircle2 className="h-4 w-4" />
                  Vollständigkeitsprüfung abgeschlossen
                </CardTitle>
                <CardDescription>
                  Die neuen Belege wurden erfolgreich zugeordnet.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Neu zugeordnet:</span>
                  <span className="font-medium text-[hsl(var(--status-confident))]">12 Belege</span>
                </div>
                <div className="bg-background rounded-lg p-4 border">
                  <div className="text-2xl font-bold text-foreground">{dringendCount} dringende Punkte</div>
                  <div className="text-sm text-muted-foreground">Insgesamt {openItemsCount} offene Punkte</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="fixed bottom-0 left-64 right-0 border-t bg-card px-6 py-4">
          <div className="max-w-[1720px] mx-auto flex justify-between">
            <Button variant="outline" onClick={goToDashboard}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zum Dashboard
            </Button>
            <Button onClick={handleNext}>
              Weiter <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </>
    );
  }

  // ============ NEW MONTH MODE ============
  return (
    <>
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center mb-2">
          <h2 className="text-xl font-semibold mb-1">Neuen Monat hinzufügen</h2>
          <p className="text-sm text-muted-foreground">
            Wähle einen Monat und lade Kontoauszüge sowie Belege hoch
          </p>
        </div>

        {/* Month selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Monat auswählen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Monat wählen..." />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Upload Kontoauszug */}
        <Card className={cn(uploadedKontoauszug && 'border-[hsl(var(--status-confident))]')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Kontoauszug hochladen
              {uploadedKontoauszug && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />}
            </CardTitle>
            <CardDescription>PDF oder CSV von deiner Bank</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedKontoauszug ? (
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Kontoauszug importiert
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleUploadKontoauszug}>
                <Upload className="mr-2 h-4 w-4" /> Kontoauszug auswählen
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Upload Kreditkartenabrechnung */}
        <Card className={cn(uploadedKreditkarte && 'border-[hsl(var(--status-confident))]')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Kreditkartenabrechnung hochladen
              {uploadedKreditkarte && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />}
            </CardTitle>
            <CardDescription>PDF-Abrechnungen deiner Kreditkarten</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedKreditkarte ? (
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Kreditkartenabrechnung importiert
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleUploadKreditkarte}>
                <Upload className="mr-2 h-4 w-4" /> Kreditkartenabrechnung auswählen
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Upload Belege */}
        <Card className={cn(uploadedBelege && 'border-[hsl(var(--status-confident))]')}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Belege hochladen
              {uploadedBelege && <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-confident))] ml-auto" />}
            </CardTitle>
            <CardDescription>Rechnungen, Quittungen als PDF oder Fotos</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedBelege ? (
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Belege importiert
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={handleUploadBelege}>
                <Upload className="mr-2 h-4 w-4" /> Belege auswählen
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Vollständigkeitsprüfung Button / Progress / Result */}
        {uploadedKontoauszug && uploadedBelege && !isMatching && !matchingComplete && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Automatisches Matching</CardTitle>
              <CardDescription>
                Durch Klicken des Buttons werden die Belege automatisch den Transaktionen aus den Kontoauszügen zugeordnet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={handleStartMatching} disabled={!canStartMatching}>
                Vollständigkeitsprüfung starten <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Progress View */}
        {isMatching && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Vollständigkeitsprüfung läuft...
              </CardTitle>
              <CardDescription>
                Belege werden den Transaktionen zugeordnet. Bitte warten.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Progress value={matchingProgress} className="h-2" />
              <div className="text-sm text-muted-foreground text-center">
                {matchingProgress}% abgeschlossen
              </div>
            </CardContent>
          </Card>
        )}

        {/* Result View */}
        {matchingComplete && (
          <Card className="border-[hsl(var(--status-confident))] bg-[hsl(var(--status-confident))]/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-[hsl(var(--status-confident))]">
                <CheckCircle2 className="h-4 w-4" />
                Vollständigkeitsprüfung abgeschlossen
              </CardTitle>
              <CardDescription>
                Die automatische Zuordnung wurde erfolgreich durchgeführt.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Auto-Match Quote */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Automatisch geklärt:</span>
                <span className="font-medium text-[hsl(var(--status-confident))]">{autoMatchQuote}% der Zahlungen</span>
              </div>
              
              {/* Urgent + Total Points */}
              <div className="bg-background rounded-lg p-4 border">
                <div className="text-2xl font-bold text-foreground">{dringendCount} dringende Punkte</div>
                <div className="text-sm text-muted-foreground">Insgesamt {openItemsCount} offene Punkte</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-64 right-0 border-t bg-card px-6 py-4">
        <div className="max-w-[1720px] mx-auto flex justify-between">
          <Button variant="outline" onClick={goToDashboard}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zum Dashboard
          </Button>
          <Button onClick={handleNext} disabled={!matchingComplete}>
            Weiter <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
