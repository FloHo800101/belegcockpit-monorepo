import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertCircle, XCircle, ArrowLeft, ArrowRight, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useBelegStore } from '@/store/belegStore';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { cn } from '@/lib/utils';

/**
 * MonthAmpel – Alternative Monatsübersicht nach dem Matching.
 *
 * Zeigt das Matching-Ergebnis als Ampel (Grün / Gelb / Rot).
 * Läuft parallel zum bestehenden Wizard-Flow (/offene-punkte)
 * und ersetzt diesen nicht.
 */
export default function MonthAmpel() {
  const navigate = useNavigate();
  const { monthId, monthLabel } = useWizardNavigation();
  const { counts, state } = useBelegStore();

  const { confident, uncertain, missing, resolved } = counts;
  const total = confident + uncertain + missing + resolved;

  // Transaktionen nach Status gruppiert für kompakte Listen
  const uncertainTxs = state.transactions
    .filter(tx => tx.status === 'matched_uncertain')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  const missingTxs = state.transactions
    .filter(tx => tx.status === 'missing_receipt')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);

  const needsAction = uncertain + missing;
  const confidenceRate = total > 0 ? Math.round((confident / total) * 100) : 0;

  const handleDetailedView = () => {
    navigate(`/mandant/monat/${monthId}/offene-punkte`);
  };

  const handleBack = () => {
    navigate(`/mandant/monat/${monthId}/setup`);
  };

  const handleFinish = () => {
    navigate(`/mandant/monat/${monthId}/abschluss`);
  };

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6 pb-28">
        {/* Header */}
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-1">{monthLabel} – Übersicht</h2>
          <p className="text-sm text-muted-foreground">
            {total} Transaktionen analysiert · Automatische Zuordnungsquote:{' '}
            <span className="font-medium">{confidenceRate} %</span>
          </p>
        </div>

        {/* Ampel-Karten */}
        <div className="grid grid-cols-1 gap-3">

          {/* GRÜN – Automatisch zugeordnet */}
          <Card className={cn(
            'border-2 transition-colors',
            confident > 0 ? 'border-[hsl(var(--status-confident))]' : 'border-muted'
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-3">
                <CheckCircle2 className={cn(
                  'h-5 w-5 shrink-0',
                  confident > 0 ? 'text-[hsl(var(--status-confident))]' : 'text-muted-foreground'
                )} />
                <span>Automatisch zugeordnet</span>
                <Badge
                  className={cn(
                    'ml-auto tabular-nums',
                    confident > 0
                      ? 'bg-[hsl(var(--status-confident))] text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {confident}
                </Badge>
              </CardTitle>
              <CardDescription className="ml-8">
                Diese Transaktionen haben einen passenden Beleg – kein Handlungsbedarf.
              </CardDescription>
            </CardHeader>
          </Card>

          {/* GELB – Vorschlag vorhanden, bitte prüfen */}
          <Card className={cn(
            'border-2 transition-colors',
            uncertain > 0 ? 'border-[hsl(var(--status-uncertain))]' : 'border-muted'
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-3">
                <AlertCircle className={cn(
                  'h-5 w-5 shrink-0',
                  uncertain > 0 ? 'text-[hsl(var(--status-uncertain))]' : 'text-muted-foreground'
                )} />
                <span>Vorschlag – bitte prüfen</span>
                <Badge
                  className={cn(
                    'ml-auto tabular-nums',
                    uncertain > 0
                      ? 'bg-[hsl(var(--status-uncertain))] text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {uncertain}
                </Badge>
              </CardTitle>
              <CardDescription className="ml-8">
                Ein passender Beleg wurde gefunden, ist aber nicht eindeutig. Kurze Bestätigung nötig.
              </CardDescription>
            </CardHeader>
            {uncertainTxs.length > 0 && (
              <CardContent className="pt-0 ml-8">
                <ul className="space-y-1.5">
                  {uncertainTxs.map(tx => (
                    <li key={tx.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate max-w-[260px]">{tx.merchant}</span>
                      <span className="tabular-nums text-muted-foreground ml-2 shrink-0">
                        {tx.amount < 0 ? '−' : '+'}{Math.abs(tx.amount).toFixed(2)} €
                      </span>
                    </li>
                  ))}
                  {uncertain > 5 && (
                    <li className="text-xs text-muted-foreground">
                      + {uncertain - 5} weitere
                    </li>
                  )}
                </ul>
              </CardContent>
            )}
          </Card>

          {/* ROT – Kein Beleg gefunden */}
          <Card className={cn(
            'border-2 transition-colors',
            missing > 0 ? 'border-[hsl(var(--status-missing))]' : 'border-muted'
          )}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-3">
                <XCircle className={cn(
                  'h-5 w-5 shrink-0',
                  missing > 0 ? 'text-[hsl(var(--status-missing))]' : 'text-muted-foreground'
                )} />
                <span>Beleg fehlt</span>
                <Badge
                  className={cn(
                    'ml-auto tabular-nums',
                    missing > 0
                      ? 'bg-[hsl(var(--status-missing))] text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {missing}
                </Badge>
              </CardTitle>
              <CardDescription className="ml-8">
                Für diese Transaktionen wurde kein passender Beleg gefunden.
              </CardDescription>
            </CardHeader>
            {missingTxs.length > 0 && (
              <CardContent className="pt-0 ml-8">
                <ul className="space-y-1.5">
                  {missingTxs.map(tx => (
                    <li key={tx.id} className="flex items-center justify-between text-sm">
                      <span className="text-foreground truncate max-w-[260px]">{tx.merchant}</span>
                      <span className="tabular-nums text-muted-foreground ml-2 shrink-0">
                        {tx.amount < 0 ? '−' : '+'}{Math.abs(tx.amount).toFixed(2)} €
                      </span>
                    </li>
                  ))}
                  {missing > 5 && (
                    <li className="text-xs text-muted-foreground">
                      + {missing - 5} weitere
                    </li>
                  )}
                </ul>
              </CardContent>
            )}
          </Card>

        </div>

        {/* Handlungsempfehlung */}
        {needsAction > 0 ? (
          <Card className="bg-muted/40 border-muted">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-foreground">
                <span className="font-medium">{needsAction} Transaktionen</span> brauchen deine Aufmerksamkeit.
                Klicke auf „Jetzt klären", um sie der Reihe nach abzuarbeiten.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-[hsl(var(--status-confident))]/5 border-[hsl(var(--status-confident))]">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-[hsl(var(--status-confident))] shrink-0" />
              <p className="text-sm text-foreground font-medium">
                Alles zugeordnet – der Monat ist bereit zur Übergabe.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-64 right-0 border-t bg-card px-6 py-4">
        <div className="max-w-[1720px] mx-auto flex justify-between items-center">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
          </Button>

          <div className="flex gap-3">
            {needsAction > 0 && (
              <Button variant="outline" onClick={handleDetailedView}>
                <List className="mr-2 h-4 w-4" />
                Detailansicht (alt)
              </Button>
            )}
            {needsAction > 0 ? (
              <Button onClick={handleDetailedView}>
                Jetzt klären <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleFinish}>
                Monat übergeben <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
