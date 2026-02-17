// SFA Cluster Workbench - Main page for cluster-based case processing
// Route: /kanzlei/mandant/:mandantId/monat/:monthId/cluster/:queueId

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { SfaCaseInspector } from '../components/SfaCaseInspector';
import { useInquiryPackage } from '../stores/inquiryPackageStore';
import { generateSfaCases } from '../data/sfaMockData';
import {
  SfaCase,
  SfaQueueId,
  SFA_QUEUE_CONFIG,
  SFA_TRIGGER_LABELS,
  SFA_MANDANT_STATUS_LABELS,
  PaymentMethod,
} from '@/data/types';
import { 
  CreditCard, 
  Building2, 
  Wallet,
} from 'lucide-react';

// Payment method icon (small, inline)
function PaymentMethodIcon({ method }: { method: PaymentMethod }) {
  const iconClass = "h-3.5 w-3.5 text-muted-foreground";
  switch (method) {
    case 'Bank':
      return <Building2 className={iconClass} />;
    case 'Card':
    case 'Stripe':
      return <CreditCard className={iconClass} />;
    case 'PayPal':
    case 'Amazon':
      return <Wallet className={iconClass} />;
    default:
      return null;
  }
}

export default function ClusterWorkbench() {
  const { mandantId, monthId, queueId } = useParams<{
    mandantId: string;
    monthId: string;
    queueId: string;
  }>();
  const navigate = useNavigate();
  const inquiryPackage = useInquiryPackage();

  // Validate queueId
  const validQueueId = (queueId && queueId in SFA_QUEUE_CONFIG) 
    ? queueId as SfaQueueId 
    : 'missing_receipts';

  const queueConfig = SFA_QUEUE_CONFIG[validQueueId];

  // State
  const [cases, setCases] = useState<SfaCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [sidepanelOpen, setSidepanelOpen] = useState(true);

  // Load cases
  useEffect(() => {
    const generatedCases = generateSfaCases(validQueueId);
    setCases(generatedCases);
    // Auto-select first case
    if (generatedCases.length > 0) {
      setSelectedCaseId(generatedCases[0].id);
    }
  }, [validQueueId]);

  // Set inquiry package context
  useEffect(() => {
    if (mandantId && monthId) {
      inquiryPackage.setContext(mandantId, monthId);
    }
  }, [mandantId, monthId]);

  // Computed values
  const selectedCase = useMemo(() => 
    cases.find(c => c.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  const openCases = useMemo(() => 
    cases.filter(c => c.caseStatus !== 'done'),
    [cases]
  );

  const openCount = openCases.length;
  const totalCount = cases.length;

  // Navigation helpers
  const currentIndex = cases.findIndex(c => c.id === selectedCaseId);
  const hasNext = currentIndex < cases.length - 1;
  const hasPrevious = currentIndex > 0;

  const handleNext = () => {
    if (hasNext) {
      setSelectedCaseId(cases[currentIndex + 1].id);
    }
  };

  const handlePrevious = () => {
    if (hasPrevious) {
      setSelectedCaseId(cases[currentIndex - 1].id);
    }
  };

  // Auto-advance to next open case
  const advanceToNextOpen = () => {
    const nextOpen = cases.find((c, idx) => idx > currentIndex && c.caseStatus !== 'done');
    if (nextOpen) {
      setSelectedCaseId(nextOpen.id);
    } else {
      // Look from beginning
      const firstOpen = cases.find(c => c.caseStatus !== 'done');
      if (firstOpen) {
        setSelectedCaseId(firstOpen.id);
      }
    }
  };

  // Action handlers
  const handleSetMatch = () => {
    if (!selectedCase) return;
    // Mark as done and advance
    setCases(prev => prev.map(c => 
      c.id === selectedCase.id 
        ? { 
            ...c, 
            caseStatus: 'done' as const,
            auditTrail: [
              ...c.auditTrail,
              { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Zuordnung bestätigt' }
            ]
          } 
        : c
    ));
    advanceToNextOpen();
  };

  const handleMarkAsFee = () => {
    if (!selectedCase) return;
    setCases(prev => prev.map(c => 
      c.id === selectedCase.id 
        ? { 
            ...c, 
            caseStatus: 'done' as const,
            auditTrail: [
              ...c.auditTrail,
              { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Als Gebühr markiert' }
            ]
          } 
        : c
    ));
    advanceToNextOpen();
  };

  const handleAddToInquiry = (questionText: string) => {
    if (!selectedCase) return;
    inquiryPackage.addItem(selectedCase.id, questionText);
    // Add audit entry
    setCases(prev => prev.map(c => 
      c.id === selectedCase.id 
        ? { 
            ...c, 
            auditTrail: [
              ...c.auditTrail,
              { at: new Date().toISOString(), actor: 'sfa' as const, action: 'Rückfrage hinzugefügt', note: questionText }
            ]
          } 
        : c
    ));
  };

  const handleMoveToRisk = () => {
    if (!selectedCase) return;
    setCases(prev => prev.map(c => 
      c.id === selectedCase.id 
        ? { 
            ...c, 
            caseStatus: 'done' as const,
            auditTrail: [
              ...c.auditTrail,
              { at: new Date().toISOString(), actor: 'sfa' as const, action: 'In Risikofälle verschoben' }
            ]
          } 
        : c
    ));
    advanceToNextOpen();
  };

  // Format helpers
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getDaysWaiting = (waitingSince?: string) => {
    if (!waitingSince) return null;
    const waitDate = new Date(waitingSince);
    const now = new Date('2026-01-20');
    const diffTime = now.getTime() - waitDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  // Mandant name (mock)
  const mandantName = mandantId === 'demo-mandant' ? 'Mustermann GmbH' : 'Mandant';
  const monthName = monthId?.replace('-', ' ').replace(/^\w/, c => c.toUpperCase()) || 'Januar 2026';

  return (
    <div className="h-full flex flex-col">
      {/* Page Header */}
      <div className="flex-shrink-0 border-b bg-background">
        <div className="max-w-[1720px] mx-auto px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/kanzlei/mandant/${mandantId}`)}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Zurück
              </Button>
              <div className="h-6 w-px bg-border" />
              <div>
                <h1 className="text-lg font-semibold">
                  {mandantName} · {monthName} · {queueConfig.label}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {openCount} von {totalCount} Fällen offen
                </p>
              </div>
            </div>

            {/* Rückfragenpaket Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/kanzlei/mandant/${mandantId}/monat/${monthId}/rueckfragen`)}
              disabled={inquiryPackage.getItemCount() === 0}
              className={cn(
                'gap-2',
                inquiryPackage.getItemCount() > 0 && 'border-primary/50'
              )}
            >
              <Package className="h-4 w-4" />
              Rückfragenpaket öffnen {inquiryPackage.getItemCount() > 0 && `(${inquiryPackage.getItemCount()})`}
            </Button>
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
                queueId={validQueueId}
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
          {/* Table */}
          <div className="h-full overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[100px]">Datum</TableHead>
                  <TableHead className="min-w-[160px]">Empfänger / Sender</TableHead>
                  <TableHead className="min-w-[200px]">Verwendungszweck</TableHead>
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
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                      } ${sfaCase.caseStatus === 'done' ? 'opacity-50' : ''}`}
                      onClick={() => {
                        setSelectedCaseId(sfaCase.id);
                        setSidepanelOpen(true);
                      }}
                    >
                      <TableCell className="font-medium">
                        {formatDate(sfaCase.date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <PaymentMethodIcon method={sfaCase.paymentMethod} />
                          <span className="truncate max-w-[140px]">{sfaCase.counterparty}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm truncate block max-w-[200px]">
                          {sfaCase.purpose}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-medium ${sfaCase.direction === 'in' ? 'text-emerald-600' : ''}`}>
                        {sfaCase.direction === 'in' ? '+' : ''}{formatCurrency(sfaCase.amount)}
                      </TableCell>
                      <TableCell>
                        {sfaCase.receipt ? (
                          <span className="text-sm truncate block max-w-[140px]">
                            {sfaCase.receipt.fileName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sfaCase.triggerReasons.length > 0 ? (
                            sfaCase.triggerReasons.slice(0, 2).map((reason) => (
                              <Badge key={reason} variant="outline" className="text-xs">
                                {SFA_TRIGGER_LABELS[reason]}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {SFA_MANDANT_STATUS_LABELS[sfaCase.mandantStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {daysWaiting ? (
                          <span className="text-amber-600 dark:text-amber-400 text-sm">
                            {daysWaiting} Tag{daysWaiting !== 1 ? 'e' : ''}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {sfaCase.confidence !== undefined ? (
                          <span className={`text-sm ${sfaCase.confidence < 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                            {sfaCase.confidence}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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