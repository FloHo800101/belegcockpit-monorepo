// SFA Case Inspector - Sidepanel for Cluster Workbench
// Follows UX Contract: Flex-Column Layout with fixed Header/Footer, scrollable Content

import { useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle,
  Clock,
  CreditCard,
  Building2,
  Wallet,
  Check,
  FileText,
  Link2,
  Flag,
  Plus,
  MessageSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  SfaCase, 
  SfaQueueId,
  SFA_QUEUE_CONFIG,
  SFA_TRIGGER_LABELS,
  SFA_MANDANT_STATUS_LABELS,
  SFA_CASE_STATUS_LABELS,
  PaymentMethod
} from '@/data/types';

interface SfaCaseInspectorProps {
  sfaCase: SfaCase;
  queueId: SfaQueueId;
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onSetMatch: () => void;
  onMarkAsFee: () => void;
  onAddToInquiry: (questionText: string) => void;
  onMoveToRisk: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  isInInquiryPackage?: boolean;
}

// Payment method icon component
function PaymentMethodBadge({ method }: { method: PaymentMethod }) {
  const config: Record<PaymentMethod, { icon: typeof CreditCard; label: string; className: string }> = {
    Bank: { icon: Building2, label: 'Bank', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    Card: { icon: CreditCard, label: 'Karte', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    PayPal: { icon: Wallet, label: 'PayPal', className: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300' },
    Stripe: { icon: CreditCard, label: 'Stripe', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' },
    Amazon: { icon: Building2, label: 'Amazon', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' },
  };
  
  const { icon: Icon, label, className } = config[method];
  
  return (
    <Badge variant="secondary" className={`text-xs font-medium ${className}`}>
      <Icon className="h-3 w-3 mr-1" />
      {label}
    </Badge>
  );
}

// Case status badge
function CaseStatusBadge({ status }: { status: SfaCase['caseStatus'] }) {
  const config = {
    open: { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: SFA_CASE_STATUS_LABELS.open },
    waiting_mandant: { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: SFA_CASE_STATUS_LABELS.waiting_mandant },
    done: { className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: SFA_CASE_STATUS_LABELS.done },
  };
  
  const { className, label } = config[status];
  
  return (
    <Badge variant="secondary" className={`text-xs font-medium ${className}`}>
      {label}
    </Badge>
  );
}

export function SfaCaseInspector({
  sfaCase,
  queueId,
  openCount,
  totalCount,
  onClose,
  onSetMatch,
  onMarkAsFee,
  onAddToInquiry,
  onMoveToRisk,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  isInInquiryPackage = false,
}: SfaCaseInspectorProps) {
  const [showInquiryForm, setShowInquiryForm] = useState(false);
  const [inquiryText, setInquiryText] = useState('');
  const [showInquiryConfirmation, setShowInquiryConfirmation] = useState(false);

  const queueConfig = SFA_QUEUE_CONFIG[queueId];

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (isoStr: string) => {
    const date = new Date(isoStr);
    return `${date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · ${date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // Calculate days waiting
  const getDaysWaiting = () => {
    if (!sfaCase.waitingSince) return null;
    const waitDate = new Date(sfaCase.waitingSince);
    const now = new Date('2026-01-20'); // Mock current date
    const diffTime = now.getTime() - waitDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysWaiting = getDaysWaiting();

  // Handle inquiry form submission
  const handleInquirySubmit = () => {
    if (!inquiryText.trim()) return;
    onAddToInquiry(inquiryText);
    setInquiryText('');
    setShowInquiryForm(false);
    setShowInquiryConfirmation(true);
    // Hide confirmation after 3 seconds
    setTimeout(() => setShowInquiryConfirmation(false), 3000);
  };

  const handleInquiryCancel = () => {
    setShowInquiryForm(false);
    setInquiryText('');
  };

  // Calculate amount deviation if receipt exists
  const amountDeviation = sfaCase.receipt 
    ? sfaCase.amount - sfaCase.receipt.amount 
    : null;

  return (
    <div className="bg-background flex flex-col h-full">
      {/* Header - fixed */}
      <div className="p-5 border-b space-y-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-base truncate">{queueConfig.label}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1 flex-shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <CaseStatusBadge status={sfaCase.caseStatus} />
        <p className="text-sm text-muted-foreground leading-relaxed">
          {queueConfig.description}
        </p>
      </div>

      {/* Progress Callout */}
      <div className="mx-5 my-4 flex-shrink-0">
        <div className="relative rounded-lg p-4 pl-5 overflow-hidden bg-muted/50 border border-border">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-primary/50" />
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">
                Noch {openCount} von {totalCount} Fällen offen
              </p>
              <p className="text-xs text-muted-foreground">
                Jeder geklärte Fall bringt dich näher zum Monatsabschluss.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-auto min-h-0 px-5 pb-5 space-y-5">
        {/* Audit Trail */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Verlauf</h3>
          <div className="space-y-2">
            {sfaCase.auditTrail.map((entry, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground text-xs min-w-[90px]">
                  {formatDateTime(entry.at)}
                </span>
                <span className={entry.actor === 'sfa' ? 'text-primary' : 'text-foreground'}>
                  {entry.actor === 'sfa' ? 'SFA' : 'Mandant'}: {entry.action}
                </span>
              </div>
            ))}
            {daysWaiting && (
              <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 mt-2">
                <Clock className="h-4 w-4" />
                <span>Wartet seit {daysWaiting} Tag{daysWaiting !== 1 ? 'en' : ''}</span>
              </div>
            )}
          </div>
        </div>

        <Separator />

        {/* Transaction Details */}
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Transaktionsdetails</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Datum</span>
              <span className="text-sm font-medium">{formatDate(sfaCase.date)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Betrag</span>
              <span className={`text-lg font-semibold ${sfaCase.direction === 'in' ? 'text-emerald-600' : ''}`}>
                {sfaCase.direction === 'in' ? '+' : ''}{formatCurrency(sfaCase.amount)}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Empfänger / Sender</span>
              <div className="text-right">
                <span className="text-sm font-medium block">{sfaCase.counterparty}</span>
                <div className="mt-1">
                  <PaymentMethodBadge method={sfaCase.paymentMethod} />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Verwendungszweck</span>
              <span className="text-sm text-right max-w-[220px] text-muted-foreground break-words">
                {sfaCase.purpose}
              </span>
            </div>
            {sfaCase.confidence !== undefined && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Confidence</span>
                <span className={`text-sm font-medium ${sfaCase.confidence < 50 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {sfaCase.confidence}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Trigger Reasons (Prüfanlass) */}
        {sfaCase.triggerReasons.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Prüfanlass</h3>
              <div className="flex flex-wrap gap-2">
                {sfaCase.triggerReasons.map((reason) => (
                  <Badge key={reason} variant="outline" className="text-xs">
                    {SFA_TRIGGER_LABELS[reason]}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Mandant Status */}
        <Separator />
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Mandanten-Status</h3>
          <Badge variant="secondary" className="text-xs">
            {SFA_MANDANT_STATUS_LABELS[sfaCase.mandantStatus]}
          </Badge>
        </div>

        {/* Receipt Details */}
        {sfaCase.receipt && (
          <>
            <Separator />
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Zugeordneter Beleg</h3>
              <div className="space-y-3 p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{sfaCase.receipt.fileName}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Belegdatum</span>
                  <span>{formatDate(sfaCase.receipt.date)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Belegbetrag</span>
                  <span className="font-medium">{formatCurrency(sfaCase.receipt.amount)}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Deviations */}
        {amountDeviation !== null && amountDeviation !== 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Abweichungen</h3>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>Betrag weicht ab: {amountDeviation > 0 ? '+' : ''}{formatCurrency(amountDeviation)}</span>
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Actions */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Aktionen</h3>
          
          {/* Inquiry confirmation */}
          {showInquiryConfirmation && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-sm">
              <Check className="h-4 w-4" />
              <span>Zum Rückfragenpaket hinzugefügt</span>
            </div>
          )}

          {/* Inline inquiry form */}
          {showInquiryForm ? (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
              <label className="text-sm font-medium">
                Was soll der Mandant klären?
              </label>
              <Textarea
                placeholder="z.B. Bitte Beleg nachreichen oder erklären, warum kein Beleg vorliegt."
                value={inquiryText}
                onChange={(e) => setInquiryText(e.target.value)}
                className="min-h-[80px] resize-none"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={handleInquiryCancel}>
                  Abbrechen
                </Button>
                <Button size="sm" onClick={handleInquirySubmit} disabled={!inquiryText.trim()}>
                  Hinzufügen
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Primary action - only show if receipt exists */}
              {sfaCase.receipt && (
                <Button className="w-full" onClick={onSetMatch}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Zuordnung setzen / ändern
                </Button>
              )}

              {/* Secondary actions */}
              <Button variant="outline" className="w-full" onClick={onMarkAsFee}>
                <CreditCard className="mr-2 h-4 w-4" />
                Als Gebühr markieren
              </Button>

              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => setShowInquiryForm(true)}
                disabled={isInInquiryPackage}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                {isInInquiryPackage ? 'Bereits im Rückfragenpaket' : 'Zu Rückfragen hinzufügen'}
              </Button>

              {/* Ghost action */}
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={onMoveToRisk}>
                <Flag className="mr-2 h-4 w-4" />
                In Risikofälle verschieben
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Footer Navigation - fixed */}
      <div className="border-t p-4 flex items-center justify-between bg-muted/30 flex-shrink-0">
        <Button
          variant="ghost"
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="gap-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Vorheriger Fall
        </Button>
        <Button
          variant="outline"
          onClick={onNext}
          disabled={!hasNext}
          className="gap-2"
        >
          Nächster Fall
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}