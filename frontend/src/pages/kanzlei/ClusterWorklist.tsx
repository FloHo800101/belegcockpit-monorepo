// Cluster Worklist Page - Following UX Contract pattern (table + sidepanel)
// Route: /kanzlei/mandant/:id/cluster/:clusterKey

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileX, Package, Building2, CreditCard, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DetailPageShell } from '@/features/mandant/components/DetailPageShell';
import { SfaCaseInspector } from '@/features/kanzlei/components/SfaCaseInspector';
import { useInquiryPackage } from '@/features/kanzlei/stores/inquiryPackageStore';
import { generateSfaCases } from '@/features/kanzlei/data/sfaMockData';
import {
  SfaCase,
  SfaQueueId,
  SFA_QUEUE_CONFIG,
  SFA_TRIGGER_LABELS,
  SFA_MANDANT_STATUS_LABELS,
  PaymentMethod,
  KanzleiCluster,
  CLUSTER_CONFIG,
} from '@/data/types';

// Map old cluster keys to new queue IDs
const CLUSTER_TO_QUEUE: Record<string, SfaQueueId> = {
  'missing_receipt': 'missing_receipts',
  'needs_review': 'clarify_matching',
  'duplicate_risk': 'duplicates_corrections',
  'tax_risk': 'tax_risks',
  'anomaly': 'tax_risks',
  'recurring_payment': 'fees_misc',
  'small_no_receipt': 'fees_misc',
  'auto_ok': 'fees_misc',
};

function PaymentMethodIcon({ method }: { method: PaymentMethod }) {
  const iconClass = "h-3.5 w-3.5 text-muted-foreground";
  switch (method) {
    case 'Bank': return <Building2 className={iconClass} />;
    case 'Card':
    case 'Stripe': return <CreditCard className={iconClass} />;
    case 'PayPal':
    case 'Amazon': return <Wallet className={iconClass} />;
    default: return null;
  }
}

function getCaseStatusBadge(status: SfaCase['caseStatus']) {
  switch (status) {
    case 'open': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Offen</Badge>;
    case 'waiting_mandant': return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Wartet auf Mandant</Badge>;
    case 'done': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Erledigt</Badge>;
    default: return null;
  }
}

export default function ClusterWorklist() {
  const { id: mandantId, clusterKey } = useParams<{ id: string; clusterKey: string }>();
  const navigate = useNavigate();
  const inquiryPackage = useInquiryPackage();

  const queueId: SfaQueueId = CLUSTER_TO_QUEUE[clusterKey || ''] || 'missing_receipts';
  const queueConfig = SFA_QUEUE_CONFIG[queueId];
  const clusterConfig = clusterKey && CLUSTER_CONFIG[clusterKey as KanzleiCluster];
  const displayTitle = clusterConfig?.label || queueConfig.label;

  const [cases, setCases] = useState<SfaCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [sidepanelOpen, setSidepanelOpen] = useState(true);

  useEffect(() => {
    const generatedCases = generateSfaCases(queueId, 15);
    setCases(generatedCases);
    if (generatedCases.length > 0) setSelectedCaseId(generatedCases[0].id);
  }, [queueId]);

  useEffect(() => {
    if (mandantId) inquiryPackage.setContext(mandantId, 'januar-2026');
  }, [mandantId]);

  const selectedCase = useMemo(() => cases.find(c => c.id === selectedCaseId) || null, [cases, selectedCaseId]);
  const openCases = useMemo(() => cases.filter(c => c.caseStatus !== 'done'), [cases]);
  const openCount = openCases.length;
  const totalCount = cases.length;

  const currentIndex = cases.findIndex(c => c.id === selectedCaseId);
  const hasNext = currentIndex < cases.length - 1;
  const hasPrevious = currentIndex > 0;

  const handleNext = () => { if (hasNext) setSelectedCaseId(cases[currentIndex + 1].id); };
  const handlePrevious = () => { if (hasPrevious) setSelectedCaseId(cases[currentIndex - 1].id); };

  const advanceToNextOpen = () => {
    const nextOpen = cases.find((c, idx) => idx > currentIndex && c.caseStatus !== 'done');
    if (nextOpen) setSelectedCaseId(nextOpen.id);
    else {
      const firstOpen = cases.find(c => c.caseStatus !== 'done');
      if (firstOpen) setSelectedCaseId(firstOpen.id);
    }
  };

  const handleSetMatch = () => {
    if (!selectedCase) return;
    setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, caseStatus: 'done' as const, auditTrail: [...c.auditTrail, { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Zuordnung bestätigt' }] } : c));
    advanceToNextOpen();
  };

  const handleMarkAsFee = () => {
    if (!selectedCase) return;
    setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, caseStatus: 'done' as const, auditTrail: [...c.auditTrail, { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Als ohne Beleg akzeptiert' }] } : c));
    advanceToNextOpen();
  };

  const handleAddToInquiry = (questionText: string) => {
    if (!selectedCase) return;
    inquiryPackage.addItem(selectedCase.id, questionText);
    setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, caseStatus: 'waiting_mandant' as const, waitingSince: new Date().toISOString(), auditTrail: [...c.auditTrail, { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Rückfrage hinzugefügt', note: questionText }] } : c));
  };

  const handleMoveToRisk = () => {
    if (!selectedCase) return;
    setCases(prev => prev.map(c => c.id === selectedCase.id ? { ...c, caseStatus: 'done' as const, auditTrail: [...c.auditTrail, { at: new Date().toISOString(), actor: 'sfa' as const, action: 'In Risk-Queue verschoben' }] } : c));
    advanceToNextOpen();
  };

  const formatCurrency = (amount: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const getDaysWaiting = (waitingSince?: string) => {
    if (!waitingSince) return null;
    const diffTime = new Date('2026-01-20').getTime() - new Date(waitingSince).getTime();
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  };

  const mandantName = mandantId === 'mandant-a' ? 'Mandant A' : 'Mustermann GmbH';

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex-shrink-0 border-b bg-background">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between max-w-[1720px]">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/kanzlei/mandant/${mandantId}`)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Zurück
              </Button>
              <div className="h-6 w-px bg-border" />
              <div className="flex items-center gap-3">
                <FileX className="h-5 w-5 text-muted-foreground" />
                <div>
                  <h1 className="text-lg font-semibold">{mandantName} · {displayTitle}</h1>
                  <p className="text-sm text-muted-foreground">{openCount} von {totalCount} Fällen offen</p>
                </div>
              </div>
            </div>
            {inquiryPackage.getItemCount() > 0 && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/kanzlei/mandant/${mandantId}/monat/januar-2026/rueckfragen`)} className="gap-2">
                <Package className="h-4 w-4" />
                Rückfragen verwalten ({inquiryPackage.getItemCount()})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DetailPageShell
          sidepanelOpen={sidepanelOpen && !!selectedCase}
          sidepanel={
            selectedCase ? (
              <SfaCaseInspector
                sfaCase={selectedCase}
                queueId={queueId}
                openCount={openCount}
                totalCount={totalCount}
                onClose={() => setSidepanelOpen(false)}
                onSetMatch={handleSetMatch}
                onMarkAsFee={handleMarkAsFee}
                onAddToInquiry={handleAddToInquiry}
                onMoveToRisk={handleMoveToRisk}
                onNext={handleNext}
                onPrevious={handlePrevious}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                isInInquiryPackage={inquiryPackage.hasItem(selectedCase.id)}
              />
            ) : null
          }
        >
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead className="min-w-[160px]">Empfänger / Sender</TableHead>
                  <TableHead className="min-w-[200px]">Betreff / Verwendungszweck</TableHead>
                  <TableHead className="text-right w-[120px]">Betrag</TableHead>
                  <TableHead className="w-[160px]">Zugeordneter Beleg</TableHead>
                  <TableHead className="w-[140px]">Prüfanlass</TableHead>
                  <TableHead className="w-[160px]">Mandanten-Status</TableHead>
                  <TableHead className="w-[100px]">Warten seit</TableHead>
                  <TableHead className="text-right w-[80px]">Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((sfaCase) => {
                  const isSelected = sfaCase.id === selectedCaseId;
                  const daysWaiting = getDaysWaiting(sfaCase.waitingSince);
                  return (
                    <TableRow
                      key={sfaCase.id}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-muted' : 'hover:bg-muted/50'} ${sfaCase.caseStatus === 'done' ? 'opacity-50' : ''}`}
                      onClick={() => { setSelectedCaseId(sfaCase.id); setSidepanelOpen(true); }}
                    >
                      <TableCell className="font-medium">{formatDate(sfaCase.date)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon method={sfaCase.paymentMethod} />
                          <span className="truncate max-w-[140px]">{sfaCase.counterparty}</span>
                        </div>
                      </TableCell>
                      <TableCell><span className="text-muted-foreground text-sm truncate block max-w-[200px]">{sfaCase.purpose}</span></TableCell>
                      <TableCell className={`text-right font-medium ${sfaCase.direction === 'in' ? 'text-emerald-600' : ''}`}>
                        {sfaCase.direction === 'in' ? '+' : ''}{formatCurrency(sfaCase.amount)}
                      </TableCell>
                      <TableCell>{sfaCase.receipt ? <span className="text-sm truncate block max-w-[140px]">{sfaCase.receipt.fileName}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {queueId === 'missing_receipts' && !sfaCase.receipt && (
                            <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">Beleg fehlt</Badge>
                          )}
                          {sfaCase.triggerReasons.length > 0 ? sfaCase.triggerReasons.slice(0, 2).map((reason) => (
                            <Badge key={reason} variant="outline" className="text-xs">{SFA_TRIGGER_LABELS[reason]}</Badge>
                          )) : queueId !== 'missing_receipts' && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{SFA_MANDANT_STATUS_LABELS[sfaCase.mandantStatus]}</Badge></TableCell>
                      <TableCell>
                        {sfaCase.caseStatus === 'waiting_mandant' && daysWaiting ? (
                          <span className="text-amber-600 dark:text-amber-400 text-sm">{daysWaiting} Tag{daysWaiting !== 1 ? 'e' : ''}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {sfaCase.confidence !== undefined ? (
                          <span className={`text-sm ${sfaCase.confidence < 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>{sfaCase.confidence}%</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DetailPageShell>
      </div>
    </div>
  );
}
