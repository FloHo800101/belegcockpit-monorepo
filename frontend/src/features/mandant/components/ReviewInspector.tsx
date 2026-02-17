import { useState } from 'react';
import { X, AlertTriangle, Check, HelpCircle, ChevronLeft, ChevronRight, FileText, ArrowRight, Eye, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ReceiptViewerSheet } from './ReceiptViewerSheet';
import { Document, Transaction } from '@/data/types';
import { MatchScoreAnalyseDialog, calculateMatchScore } from './MatchScoreAnalyseDialog';

export interface ReviewItem {
  id: string;
  transactionId: string;
  transactionDate: string;
  transactionAmount: number;
  transactionMerchant: string;
  transactionPurpose: string;
  documentId: string;
  documentName: string;
  documentDate: string;
  documentAmount: number;
  confidence: number;
  reviewReason: 'low_confidence' | 'amount_deviation' | 'date_deviation' | 'classification' | 'ambiguous';
  deviationDetails?: string;
}

interface ReviewInspectorProps {
  reviewItem: ReviewItem;
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onHandover: (comment: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

// Helper: Comparison Panel for side-by-side display
interface ComparisonPanelProps {
  transaction: {
    date: string;
    amount: number;
    merchant: string;
    purpose: string;
  };
  receipt: {
    supplier: string;
    date: string;
    amount: number;
    fileName?: string;
  };
  onViewReceipt: () => void;
}

function ComparisonPanel({ transaction, receipt, onViewReceipt }: ComparisonPanelProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const delta = receipt.amount - Math.abs(transaction.amount);
  const hasDelta = Math.abs(delta) > 0.01;
  const deltaLabel = delta > 0 ? 'Beleg > Bankkonto' : 'Bankkonto > Beleg';

  return (
    <div className="space-y-3">
      {/* Delta row - prominent at top */}
      {hasDelta && (
        <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200/50 dark:border-amber-800/30">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Differenz: {delta > 0 ? '+' : ''}{formatCurrency(delta)}
          </span>
          <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
            ({deltaLabel})
          </span>
        </div>
      )}

      {/* Two-column comparison grid */}
      <div className="grid grid-cols-2 gap-3">
        {/* Left: Bankkonto (Transaction) */}
        <div className="bg-muted/40 rounded-lg p-3 border border-border/50">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-1.5 border-b border-border/50">
            Bankkonto
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Datum</span>
              <span className="font-medium">{formatDate(transaction.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Betrag</span>
              <span className="font-semibold tabular-nums">{formatCurrency(transaction.amount)}</span>
            </div>
            <div className="pt-1.5 border-t border-border/30">
              <span className="text-xs text-muted-foreground">Empfänger</span>
              <p className="text-sm font-medium mt-0.5">{transaction.merchant}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Verwendungszweck</span>
              <p className="text-xs mt-0.5 line-clamp-2 text-foreground/80">{transaction.purpose}</p>
            </div>
          </div>
        </div>

        {/* Arrow between columns (desktop only, overlaid) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:flex items-center justify-center pointer-events-none z-10">
          <div className="bg-amber-100 dark:bg-amber-900/50 rounded-full p-1.5">
            <ArrowRight className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
        </div>

        {/* Right: Beleg (Receipt) */}
        <div className="bg-muted/40 rounded-lg p-3 border border-border/50">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 pb-1.5 border-b border-border/50">
            Beleg
          </div>
          <div className="space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lieferant</span>
              <span className="font-medium text-right truncate max-w-[100px]">{receipt.supplier}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Belegdatum</span>
              <span className="font-medium">{formatDate(receipt.date)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Belegbetrag</span>
              <span className="font-semibold tabular-nums">{formatCurrency(receipt.amount)}</span>
            </div>
            {receipt.fileName && (
              <div className="pt-1.5 border-t border-border/30 text-xs text-muted-foreground truncate">
                {receipt.fileName}
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full mt-1" onClick={onViewReceipt}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Beleg ansehen
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReviewInspector({
  reviewItem,
  openCount,
  totalCount,
  onClose,
  onConfirm,
  onReject,
  onHandover,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: ReviewInspectorProps) {
  const [showHandoverForm, setShowHandoverForm] = useState(false);
  const [handoverComment, setHandoverComment] = useState('');
  const [isReceiptSheetOpen, setIsReceiptSheetOpen] = useState(false);
  const [showMatchAnalyse, setShowMatchAnalyse] = useState(false);
  
  // Calculate match score breakdown for the dialog
  const scoreBreakdown = calculateMatchScore(reviewItem);

  // Create mock document and transaction objects for the ReceiptViewerSheet
  const mockDocument: Document = {
    id: reviewItem.documentId,
    supplierName: reviewItem.documentName,
    date: reviewItem.documentDate,
    total: reviewItem.documentAmount,
    vat: reviewItem.documentAmount * 0.19,
    linkedTransactionId: reviewItem.transactionId,
    quality: 'ok',
  };

  const mockTransaction: Transaction = {
    id: reviewItem.transactionId,
    date: reviewItem.transactionDate,
    amount: reviewItem.transactionAmount,
    currency: 'EUR',
    merchant: reviewItem.transactionMerchant,
    paymentMethod: 'Bank',
    status: 'matched_uncertain',
    matchConfidence: reviewItem.confidence,
    mandantActionPrimary: 'review',
    mandantPackageKey: 'other_open',
    mandantReasonHint: '',
    kanzleiClusterPrimary: 'missing',
    kanzleiReasonHint: '',
    purpose: reviewItem.transactionPurpose,
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));

  const getReviewReasonLabel = (reason: ReviewItem['reviewReason']) => {
    switch (reason) {
      case 'low_confidence': return 'Unsicher';
      case 'amount_deviation': return 'Betrag abweichend';
      case 'date_deviation': return 'Datum abweichend';
      case 'classification': return 'Klassifizierung';
      case 'ambiguous': return 'Mehrdeutig';
    }
  };

  const getReviewReasonBadgeClass = (reason: ReviewItem['reviewReason']) => {
    switch (reason) {
      case 'low_confidence': return 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400';
      case 'amount_deviation': return 'border-red-500/30 text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400';
      case 'date_deviation': return 'border-orange-500/30 text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400';
      case 'classification': return 'border-purple-500/30 text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400';
      case 'ambiguous': return 'border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400';
    }
  };

  const handleHandoverSubmit = () => {
    if (handoverComment.trim()) {
      onHandover(handoverComment);
      setShowHandoverForm(false);
      setHandoverComment('');
    }
  };

  // Calculate amount deviation
  const amountDiff = Math.abs(reviewItem.transactionAmount) - reviewItem.documentAmount;
  const hasAmountDeviation = Math.abs(amountDiff) > 0.01;

  // Calculate date deviation
  const txDate = new Date(reviewItem.transactionDate);
  const docDate = new Date(reviewItem.documentDate);
  const dateDiffDays = Math.round(Math.abs(txDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));

  // Collect unique reasons (deduplicated)
  const reasons: string[] = [];
  
  if (reviewItem.reviewReason === 'low_confidence') {
    reasons.push(`Zuordnung unsicher (Confidence: ${reviewItem.confidence}%)`);
  }
  if (hasAmountDeviation) {
    // Only add amount deviation if not already covered by deviationDetails
    if (!reviewItem.deviationDetails?.toLowerCase().includes('betrag')) {
      reasons.push(`Betrag weicht um ${formatCurrency(amountDiff)} ab`);
    }
  }
  if (dateDiffDays > 3) {
    // Only add date deviation if not already covered by deviationDetails
    if (!reviewItem.deviationDetails?.toLowerCase().includes('datum') && !reviewItem.deviationDetails?.toLowerCase().includes('tage')) {
      reasons.push(`Datum ${dateDiffDays} Tage Differenz`);
    }
  }
  if (reviewItem.reviewReason === 'classification') {
    reasons.push('Klassifizierung automatisch erkannt, aber unsicher');
  }
  if (reviewItem.reviewReason === 'ambiguous') {
    reasons.push('Mehrere mögliche Zuordnungen gefunden');
  }
  // Add deviationDetails only if provided (this is the primary source)
  if (reviewItem.deviationDetails) {
    reasons.push(reviewItem.deviationDetails);
  }

  // Generate explanation text based on deviation type
  const getExplanationText = () => {
    if (hasAmountDeviation) {
      const lower = amountDiff < 0 ? 'niedriger' : 'höher';
      return `Der Betrag auf dem Kontoauszug ist ${lower} als auf dem Beleg. Das kann z. B. an Trinkgeld oder Gebühren liegen.`;
    }
    if (dateDiffDays > 3) {
      return 'Das Belegdatum liegt mehrere Tage vom Buchungsdatum entfernt. Das kann z. B. bei Vorkasse oder verspäteter Buchung vorkommen.';
    }
    if (reviewItem.reviewReason === 'ambiguous') {
      return 'Es wurden mehrere mögliche Belege gefunden. Bitte prüfe, welcher Beleg zur Zahlung passt.';
    }
    return 'Die automatische Zuordnung war unsicher. Bitte prüfe, ob Beleg und Zahlung zusammengehören.';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - fixed */}
      <div className="flex-shrink-0 px-5 pt-5 pb-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold truncate">Zuordnung prüfen</h3>
              <Badge 
                variant="outline" 
                className={`text-xs font-medium ${getReviewReasonBadgeClass(reviewItem.reviewReason)}`}
              >
                {getReviewReasonLabel(reviewItem.reviewReason)}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {reviewItem.transactionMerchant} · {formatCurrency(reviewItem.transactionAmount)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="flex-shrink-0 -mr-2 -mt-1">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-5 py-4 space-y-5">
          {/* "Warum markiert?" - at top, single, deduplicated */}
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-900 dark:text-amber-100">Warum markiert?</div>
                <div className="space-y-1 mt-1.5">
                  {reasons.map((reason, idx) => (
                    <p key={idx} className="text-xs text-amber-700 dark:text-amber-300">
                      • {reason}
                    </p>
                  ))}
                </div>
                <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-2 pt-2 border-t border-amber-200/50 dark:border-amber-700/50">
                  {getExplanationText()}
                </p>
              </div>
            </div>
          </div>

          {/* Match-Confidence (clickable to show analysis dialog) */}
          <button
            onClick={() => setShowMatchAnalyse(true)}
            className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer w-full text-left group"
          >
            <HelpCircle className="h-4 w-4 text-amber-500" />
            <span className="text-sm text-muted-foreground">Match-Confidence:</span>
            <Badge 
              variant="outline" 
              className={`text-xs font-medium tabular-nums ${
                reviewItem.confidence >= 80 
                  ? 'border-green-500/30 text-green-600 bg-green-50 dark:bg-green-950/50' 
                  : reviewItem.confidence >= 60 
                    ? 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/50'
                    : 'border-red-500/30 text-red-600 bg-red-50 dark:bg-red-950/50'
              }`}
            >
              {reviewItem.confidence}%
            </Badge>
            <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>

          {/* Two-Column Comparison Panel */}
          <div className="relative">
            <ComparisonPanel
              transaction={{
                date: reviewItem.transactionDate,
                amount: reviewItem.transactionAmount,
                merchant: reviewItem.transactionMerchant,
                purpose: reviewItem.transactionPurpose,
              }}
              receipt={{
                supplier: reviewItem.documentName,
                date: reviewItem.documentDate,
                amount: reviewItem.documentAmount,
                fileName: `Beleg_${reviewItem.documentId}.pdf`,
              }}
              onViewReceipt={() => setIsReceiptSheetOpen(true)}
            />
          </div>

          <Separator />

          {/* Actions */}
          <div className="space-y-3">
            {/* Primary Actions */}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={onConfirm} className="w-full">
                <Check className="mr-2 h-4 w-4" />
                Zuordnung bestätigen
              </Button>
              <Button variant="outline" onClick={onReject} className="w-full">
                Zuordnung ändern
              </Button>
            </div>

            {/* Secondary Actions */}
            {!showHandoverForm ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground"
                onClick={() => setShowHandoverForm(true)}
              >
                An Kanzlei übergeben
              </Button>
            ) : (
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground">
                  Bitte gib einen kurzen Kommentar ein (Pflicht):
                </p>
                <Textarea
                  value={handoverComment}
                  onChange={(e) => setHandoverComment(e.target.value)}
                  placeholder="z. B. Unsicher, bitte prüfen..."
                  className="min-h-[60px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowHandoverForm(false);
                      setHandoverComment('');
                    }}
                  >
                    Abbrechen
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleHandoverSubmit}
                    disabled={!handoverComment.trim()}
                  >
                    Übergeben
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Navigation - fixed */}
      <div className="flex-shrink-0 px-5 py-3 border-t bg-background shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrevious}
            disabled={!hasPrevious}
            className="text-muted-foreground"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Vorherige Zahlung
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onNext}
            disabled={!hasNext}
            className="border-primary/30 text-primary hover:bg-primary/5"
          >
            Nächste Zahlung prüfen
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Receipt Viewer Sheet */}
      <ReceiptViewerSheet
        open={isReceiptSheetOpen}
        onOpenChange={setIsReceiptSheetOpen}
        document={mockDocument}
        transaction={mockTransaction}
      />
      
      {/* Match-Score Analyse Dialog */}
      <MatchScoreAnalyseDialog
        open={showMatchAnalyse}
        onClose={() => setShowMatchAnalyse(false)}
        breakdown={scoreBreakdown}
      />
    </div>
  );
}

// Complete state component
interface ReviewClusterCompleteProps {
  totalResolved: number;
  onContinue: () => void;
}

export function ReviewClusterComplete({ totalResolved, onContinue }: ReviewClusterCompleteProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
      <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-6">
        <Check className="h-8 w-8 text-[hsl(var(--status-confident))]" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Alle Zuordnungen geprüft!</h3>
      <p className="text-muted-foreground mb-6">
        {totalResolved} Zuordnung{totalResolved !== 1 ? 'en' : ''} wurden bearbeitet.
      </p>
      <Button onClick={onContinue}>
        Weiter zur Übersicht
      </Button>
    </div>
  );
}
