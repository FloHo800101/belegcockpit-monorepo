import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, FileText, Upload, Check, CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useBelegStore } from '@/store/belegStore';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import {
  getMyTenantId,
  uploadDocument,
  processDocument,
  runMatching,
  toApiMonthId,
} from '@/lib/documentApi';
import type { MatchingRunResult } from '@beleg-cockpit/shared';

const GERMAN_MONTH_IDS = [
  'januar', 'februar', 'maerz', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'dezember',
];
const GERMAN_MONTH_LABELS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

// Dynamische Monatsliste: aktueller Monat bis Jan 2020, neueste zuerst
function generateAvailableMonths() {
  const months = [];
  const now = new Date();
  const endYear = now.getFullYear();
  const endMonth = now.getMonth(); // 0-indexed
  for (let year = endYear; year >= 2020; year--) {
    const fromMonth = year === endYear ? endMonth : 11;
    for (let m = fromMonth; m >= 0; m--) {
      months.push({ id: `${GERMAN_MONTH_IDS[m]}-${year}`, label: `${GERMAN_MONTH_LABELS[m]} ${year}` });
    }
  }
  return months;
}
const availableMonths = generateAvailableMonths();

export default function MonthSetup() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { goToDashboard, goToOpenItems, isNewMonth, monthId, monthLabel } = useWizardNavigation();
  const { packageCounts, wizardSetup, dispatch } = useBelegStore();

  // Tenant-ID des eingeloggten Users
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Upload-Lade-States
  const [uploadingKontoauszug, setUploadingKontoauszug] = useState(false);
  const [uploadingKreditkarte, setUploadingKreditkarte] = useState(false);
  const [uploadingBelege, setUploadingBelege] = useState(false);

  // Matching-States
  const [isMatching, setIsMatching] = useState(false);
  const [matchingResult, setMatchingResult] = useState<MatchingRunResult | null>(null);

  // Existing-month mode
  const [additionalBelegeUploaded, setAdditionalBelegeUploaded] = useState(false);
  const [existingMonthMatchingComplete, setExistingMonthMatchingComplete] = useState(false);

  // Hidden file input refs
  const kontoauszugInputRef = useRef<HTMLInputElement>(null);
  const kreditkarteInputRef = useRef<HTMLInputElement>(null);
  const belegeInputRef = useRef<HTMLInputElement>(null);
  const belegeExistingInputRef = useRef<HTMLInputElement>(null);

  // Track if we've already reset the wizard for this session
  const hasResetRef = useRef(false);

  // Tenant-ID beim Mounten laden
  useEffect(() => {
    getMyTenantId()
      .then(setTenantId)
      .catch(() => {
        toast({ title: 'Fehler', description: 'Tenant konnte nicht geladen werden', variant: 'destructive' });
      });
  }, []);

  // Reset wizard state only once when entering new month setup
  useEffect(() => {
    if (isNewMonth && !hasResetRef.current) {
      hasResetRef.current = true;
      dispatch({ type: 'WIZARD_RESET' });
    }
  }, [isNewMonth, dispatch]);

  const { selectedMonth, uploadedKontoauszug, uploadedKreditkarte, uploadedBelege, matchingComplete } = wizardSetup;

  const setSelectedMonth = (month: string) => {
    dispatch({ type: 'WIZARD_SET_MONTH', payload: month });
  };

  const canStartMatching = isNewMonth && selectedMonth && uploadedKontoauszug && uploadedBelege && !isMatching && tenantId;

  // ── Upload-Handler (echt) ──────────────────────────────────────────────────

  const handleKontoauszugFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !tenantId || !user) return;

    setUploadingKontoauszug(true);
    try {
      const docId = await uploadDocument(file, tenantId, user.id);
      await processDocument(docId);
      dispatch({ type: 'WIZARD_UPLOAD_KONTOAUSZUG' });
      toast({ title: 'Kontoauszug importiert', description: file.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Upload fehlgeschlagen', description: msg, variant: 'destructive' });
    } finally {
      setUploadingKontoauszug(false);
    }
  };

  const handleKreditkarteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !tenantId || !user) return;

    setUploadingKreditkarte(true);
    try {
      const docId = await uploadDocument(file, tenantId, user.id);
      await processDocument(docId);
      dispatch({ type: 'WIZARD_UPLOAD_KREDITKARTE' });
      toast({ title: 'Kreditkartenabrechnung importiert', description: file.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Upload fehlgeschlagen', description: msg, variant: 'destructive' });
    } finally {
      setUploadingKreditkarte(false);
    }
  };

  const handleBelegeFiles = async (e: React.ChangeEvent<HTMLInputElement>, isExistingMonth = false) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length || !tenantId || !user) return;

    setUploadingBelege(true);
    try {
      // Alle Dateien parallel hochladen und verarbeiten
      await Promise.all(
        files.map(async (file) => {
          const docId = await uploadDocument(file, tenantId, user.id);
          await processDocument(docId);
        })
      );

      if (isExistingMonth) {
        setAdditionalBelegeUploaded(true);
        setExistingMonthMatchingComplete(false);
      } else {
        dispatch({ type: 'WIZARD_UPLOAD_BELEGE' });
      }
      toast({
        title: `${files.length} Beleg${files.length > 1 ? 'e' : ''} importiert`,
        description: files.map(f => f.name).join(', '),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Upload fehlgeschlagen', description: msg, variant: 'destructive' });
    } finally {
      setUploadingBelege(false);
    }
  };

  // ── Matching (echt) ────────────────────────────────────────────────────────

  const handleStartMatching = async () => {
    if (!tenantId || !selectedMonth) return;
    setIsMatching(true);
    try {
      const apiMonthId = toApiMonthId(selectedMonth);
      const result = await runMatching(tenantId, apiMonthId);
      setMatchingResult(result);
      if (isNewMonth) {
        dispatch({ type: 'WIZARD_COMPLETE_MATCHING' });
      } else {
        setExistingMonthMatchingComplete(true);
        setAdditionalBelegeUploaded(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      toast({ title: 'Matching fehlgeschlagen', description: msg, variant: 'destructive' });
    } finally {
      setIsMatching(false);
    }
  };

  const handleNext = () => {
    if (isNewMonth && matchingComplete) {
      navigate(`/mandant/monat/${selectedMonth}/offene-punkte`);
    } else if (!isNewMonth) {
      goToOpenItems(monthId);
    }
  };

  // KPIs aus dem Store (mock) für die Ergebnis-Karte
  const openItemsCount = ['top_amounts', 'other_open', 'bundles', 'subscriptions', 'refunds', 'small_no_receipt']
    .reduce((sum, key) => sum + (packageCounts[key] || 0), 0);
  const dringendCount = packageCounts.top_amounts || 0;

  // ── EXISTING MONTH MODE ───────────────────────────────────────────────────
  if (!isNewMonth) {
    return (
      <>
        {/* Hidden file inputs */}
        <input
          ref={belegeExistingInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => handleBelegeFiles(e, true)}
        />

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
                {additionalBelegeUploaded ? 'Neue Belege hochgeladen' : 'Belege bereits importiert'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => belegeExistingInputRef.current?.click()}
                disabled={uploadingBelege}
              >
                {uploadingBelege ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird hochgeladen...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Weitere Belege hochladen</>
                )}
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
                <Button className="w-full" onClick={handleStartMatching} disabled={!tenantId}>
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
            </Card>
          )}

          {/* Result View */}
          {existingMonthMatchingComplete && matchingResult && (
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
                  <span className="font-medium text-[hsl(var(--status-confident))]">
                    {matchingResult.finalMatches} Belege
                  </span>
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

  // ── NEW MONTH MODE ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Hidden file inputs */}
      <input
        ref={kontoauszugInputRef}
        type="file"
        accept=".pdf,.csv"
        className="hidden"
        onChange={handleKontoauszugFile}
      />
      <input
        ref={kreditkarteInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleKreditkarteFile}
      />
      <input
        ref={belegeInputRef}
        type="file"
        accept=".pdf,image/*"
        multiple
        className="hidden"
        onChange={(e) => handleBelegeFiles(e, false)}
      />

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
              <Button
                variant="outline"
                className="w-full"
                onClick={() => kontoauszugInputRef.current?.click()}
                disabled={uploadingKontoauszug || !tenantId}
              >
                {uploadingKontoauszug ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird verarbeitet...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Kontoauszug auswählen</>
                )}
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
            <CardDescription>PDF-Abrechnungen deiner Kreditkarten (optional)</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedKreditkarte ? (
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Kreditkartenabrechnung importiert
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => kreditkarteInputRef.current?.click()}
                disabled={uploadingKreditkarte || !tenantId}
              >
                {uploadingKreditkarte ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird verarbeitet...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Kreditkartenabrechnung auswählen</>
                )}
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
            <CardDescription>Rechnungen, Quittungen als PDF oder Fotos (Mehrfachauswahl möglich)</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadedBelege ? (
              <div className="text-sm text-[hsl(var(--status-confident))] flex items-center gap-2">
                <Check className="h-4 w-4" /> Belege importiert
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => belegeInputRef.current?.click()}
                disabled={uploadingBelege || !tenantId}
              >
                {uploadingBelege ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Wird verarbeitet...</>
                ) : (
                  <><Upload className="mr-2 h-4 w-4" /> Belege auswählen</>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Vollständigkeitsprüfung Button */}
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
          </Card>
        )}

        {/* Result View */}
        {matchingComplete && matchingResult && (
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Automatisch zugeordnet:</span>
                <span className="font-medium text-[hsl(var(--status-confident))]">
                  {matchingResult.finalMatches} von {matchingResult.txCount} Transaktionen
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vorschläge zur Prüfung:</span>
                <span className="font-medium">{matchingResult.suggestedMatches}</span>
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
          <Button onClick={handleNext} disabled={!matchingComplete}>
            Weiter <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
