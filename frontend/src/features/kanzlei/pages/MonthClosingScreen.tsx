// Monatsabschluss (SFA) Screen
// Zusammenfassung und interner Abschluss pro Mandant/Monat

import React, { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Clock, CheckCircle2, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAllSfaCases } from '@/features/kanzlei/data/sfaMockData';
import { useInquiryPackage } from '@/features/kanzlei/stores/inquiryPackageStore';
import { SfaCase, SFA_TRIGGER_LABELS } from '@/data/types';

// Mandant name lookup (mock)
const MANDANT_NAMES: Record<string, string> = {
  'mueller-gmbh': 'Müller GmbH',
  'friseur-koenig': 'Friseur König',
  'bau-co-kg': 'Bau & Co KG',
  'cafe-schmidt': 'Café Schmidt',
  'it-solutions-nord': 'IT Solutions Nord GmbH',
};

const MONTH_LABELS: Record<string, string> = {
  'januar-2026': 'Januar 2026',
  'dezember-2025': 'Dezember 2025',
  '2026-01': 'Januar 2026',
  '2025-12': 'Dezember 2025',
};

interface MonthClosingSummary {
  offenCount: number;
  waitingCount: number;
  doneCount: number;
  riskCount: number;
  oldestWaitingDays: number | null;
  lastActivity: string | null;
  waitingCases: SfaCase[];
  riskCases: SfaCase[];
}

function calculateMonthSummary(): MonthClosingSummary {
  const allCases = getAllSfaCases();
  
  let offenCount = 0;
  let waitingCount = 0;
  let doneCount = 0;
  let riskCount = 0;
  let oldestWaitingSince: Date | null = null;
  let latestActivity: Date | null = null;
  const waitingCases: SfaCase[] = [];
  const riskCases: SfaCase[] = [];
  
  Object.entries(allCases).forEach(([queueId, cases]) => {
    cases.forEach((c) => {
      if (c.caseStatus === 'open') offenCount++;
      if (c.caseStatus === 'waiting_mandant') {
        waitingCount++;
        waitingCases.push(c);
        if (c.waitingSince) {
          const waitDate = new Date(c.waitingSince);
          if (!oldestWaitingSince || waitDate < oldestWaitingSince) {
            oldestWaitingSince = waitDate;
          }
        }
      }
      if (c.caseStatus === 'done') doneCount++;
      if (queueId === 'tax_risks') {
        riskCount++;
        riskCases.push(c);
      }
      
      // Track latest audit
      c.auditTrail.forEach((entry) => {
        const entryDate = new Date(entry.at);
        if (!latestActivity || entryDate > latestActivity) {
          latestActivity = entryDate;
        }
      });
    });
  });
  
  // Sort waiting cases by waitingSince (oldest first)
  waitingCases.sort((a, b) => {
    if (!a.waitingSince) return 1;
    if (!b.waitingSince) return -1;
    return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
  });
  
  const oldestWaitingDays = oldestWaitingSince
    ? Math.floor((Date.now() - oldestWaitingSince.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  
  return {
    offenCount,
    waitingCount,
    doneCount,
    riskCount,
    oldestWaitingDays,
    lastActivity: latestActivity?.toISOString() || null,
    waitingCases: waitingCases.slice(0, 5),
    riskCases: riskCases.slice(0, 5),
  };
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'heute';
  if (diffDays === 0) return 'heute';
  if (diffDays === 1) return 'vor 1 Tag';
  return `vor ${diffDays} Tagen`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calculateWaitingDays(waitingSince: string): number {
  const days = Math.floor((Date.now() - new Date(waitingSince).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, days); // Prevent negative values
}

export default function MonthClosingScreen() {
  const { mandantId = '', monthId = '' } = useParams<{ mandantId: string; monthId: string }>();
  const navigate = useNavigate();
  const { getMonthStatus, setMonthStatus, addMonthAudit } = useInquiryPackage();
  
  const [isClosing, setIsClosing] = useState(false);
  const [justClosed, setJustClosed] = useState(false);
  
  const summary = useMemo(() => calculateMonthSummary(), []);
  const monthStatus = getMonthStatus(mandantId, monthId);
  
  const mandantName = MANDANT_NAMES[mandantId] || mandantId;
  const monthLabel = MONTH_LABELS[monthId] || monthId;
  
  const handleCloseMonth = () => {
    setIsClosing(true);
    
    // Simulate async operation
    setTimeout(() => {
      setMonthStatus(mandantId, monthId, 'closed_internal');
      addMonthAudit(mandantId, monthId, {
        at: new Date().toISOString(),
        actor: 'sfa',
        action: 'Monat intern abgeschlossen',
      });
      setIsClosing(false);
      setJustClosed(true);
    }, 500);
  };
  
  const cockpitPath = `/kanzlei/mandant/${mandantId}/monat/${monthId}`;
  const workbenchPath = `/kanzlei/mandant/${mandantId}/monat/${monthId}/cluster/missing_receipts`;
  const riskQueuePath = `/kanzlei/mandant/${mandantId}/monat/${monthId}/cluster/tax_risks`;
  
  // Determine status card state
  const statusState: 'not_ready' | 'waiting' | 'ready' = 
    summary.offenCount > 0 ? 'not_ready' :
    summary.waitingCount > 0 ? 'waiting' : 'ready';
  
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <Link 
            to={cockpitPath}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Cockpit
          </Link>
          
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {mandantName} – Abschluss {monthLabel}
            </h1>
            <p className="text-muted-foreground mt-1">
              Zusammenfassung für die interne Bearbeitung.
            </p>
          </div>
        </div>
        
        {/* Status Card */}
        <Card className={`border-2 ${
          statusState === 'not_ready' ? 'border-amber-300 bg-amber-50' :
          statusState === 'waiting' ? 'border-blue-300 bg-blue-50' :
          'border-emerald-300 bg-emerald-50'
        }`}>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              {statusState === 'not_ready' && (
                <AlertTriangle className="h-6 w-6 text-amber-600 mt-0.5" />
              )}
              {statusState === 'waiting' && (
                <Clock className="h-6 w-6 text-blue-600 mt-0.5" />
              )}
              {statusState === 'ready' && (
                <CheckCircle2 className="h-6 w-6 text-emerald-600 mt-0.5" />
              )}
              
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className={`text-lg font-semibold ${
                    statusState === 'not_ready' ? 'text-amber-800' :
                    statusState === 'waiting' ? 'text-blue-800' :
                    'text-emerald-800'
                  }`}>
                    {statusState === 'not_ready' && 'Noch nicht bereit'}
                    {statusState === 'waiting' && 'Wartet auf Mandant'}
                    {statusState === 'ready' && 'Bereit für Abschluss'}
                  </h2>
                  <p className={`text-sm mt-1 ${
                    statusState === 'not_ready' ? 'text-amber-700' :
                    statusState === 'waiting' ? 'text-blue-700' :
                    'text-emerald-700'
                  }`}>
                    {statusState === 'not_ready' && 
                      'Es sind noch offene Fälle vorhanden. Bitte klären oder Rückfragen erstellen.'}
                    {statusState === 'waiting' && 
                      'Der Monat ist fachlich vorbereitet, aber es fehlen Rückmeldungen vom Mandanten.'}
                    {statusState === 'ready' && 
                      'Alle relevanten Fälle sind geklärt.'}
                  </p>
                </div>
                
                {statusState === 'waiting' && summary.oldestWaitingDays !== null && (
                  <Badge variant="secondary" className="bg-blue-200 text-blue-800">
                    Älteste Wartezeit: {summary.oldestWaitingDays} Tage
                  </Badge>
                )}
                
                <div className="pt-2">
                  {statusState === 'not_ready' && (
                    <Button 
                      variant="outline" 
                      onClick={() => navigate(workbenchPath)}
                      className="border-amber-400 text-amber-800 hover:bg-amber-100"
                    >
                      Zurück zur Bearbeitung
                    </Button>
                  )}
                  {statusState === 'waiting' && (
                    <Button 
                      variant="outline" 
                      onClick={() => navigate(workbenchPath)}
                      className="border-blue-400 text-blue-800 hover:bg-blue-100"
                    >
                      Wartende Fälle ansehen
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600">{summary.doneCount}</div>
              <div className="text-sm text-muted-foreground mt-1">Erledigt</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{summary.waitingCount}</div>
              <div className="text-sm text-muted-foreground mt-1">Warten auf Mandant</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-amber-600">{summary.riskCount}</div>
              <div className="text-sm text-muted-foreground mt-1">Risikofälle</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-foreground">
                {summary.lastActivity ? formatRelativeTime(summary.lastActivity) : '—'}
              </div>
              <div className="text-sm text-muted-foreground mt-1">Letzte Aktivität</div>
            </CardContent>
          </Card>
        </div>
        
        {/* Offene Rückfragen Section */}
        {summary.waitingCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" />
                Offene Rückfragen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {summary.waitingCases.map((c) => (
                <div 
                  key={c.id} 
                  className="flex items-center justify-between py-2 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground w-24">
                      {formatDate(c.date)}
                    </span>
                    <span className="font-medium">{c.counterparty}</span>
                    <span className={c.amount >= 0 ? 'text-emerald-600' : 'text-foreground'}>
                      {formatCurrency(c.amount)}
                    </span>
                  </div>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                    Warten seit {c.waitingSince ? calculateWaitingDays(c.waitingSince) : '?'} Tagen
                  </Badge>
                </div>
              ))}
              
              <div className="pt-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(workbenchPath)}
                >
                  Workbench öffnen
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Risikohinweise Section */}
        {summary.riskCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                Risikohinweise
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {summary.riskCases.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm py-1">
                  <span className="text-amber-600">•</span>
                  <span>
                    {SFA_TRIGGER_LABELS[c.triggerReasons[0]] || 'Unbekannter Risikogrund'}
                    {c.amount && Math.abs(c.amount) > 1000 && (
                      <span className="text-muted-foreground ml-1">
                        ({formatCurrency(Math.abs(c.amount))})
                      </span>
                    )}
                  </span>
                </div>
              ))}
              
              <div className="pt-3">
                <Button 
                  variant="outline" 
                  onClick={() => navigate(riskQueuePath)}
                >
                  Risikofälle bearbeiten
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Actions Section */}
        <Card className="border-t-4 border-t-primary">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold">Interne Abschluss-Aktionen</h3>
                <p className="text-sm text-muted-foreground">
                  Schließen Sie den Monat intern ab, wenn alle Fälle bearbeitet sind.
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button 
                        variant="secondary" 
                        disabled
                        className="opacity-60"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Für DATEV vorbereiten
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Kommt in einer späteren Version.</p>
                  </TooltipContent>
                </Tooltip>
                
                {monthStatus === 'closed_internal' || justClosed ? (
                  <Button disabled className="bg-emerald-100 text-emerald-700 border-emerald-300">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Monat intern abgeschlossen
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCloseMonth}
                    disabled={summary.offenCount > 0 || isClosing}
                  >
                    {isClosing ? 'Wird abgeschlossen...' : 'Monat intern abschließen'}
                  </Button>
                )}
              </div>
            </div>
            
            {justClosed && (
              <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <p className="text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Monat intern abgeschlossen.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
