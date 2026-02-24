import { useState, useMemo, useEffect, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { ReviewItem, ReviewReason, Transaction, Document } from '@/data/types';
import { DetailPageShell } from '@/features/mandant/components/DetailPageShell';
import { ReviewInspector, ReviewClusterComplete } from '@/features/mandant/components/ReviewInspector';
import { CommentDialog } from '@/features/mandant/components/CommentDialog';
import { WizardFooterBar } from '@/features/mandant/components/WizardFooterBar';
import { HandoverMonthDialog } from '@/features/mandant/components/HandoverMonthDialog';
import { useBelegStore } from '@/store/belegStore';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const ITEMS_PER_PAGE = 10;

// MatchCandidate type for this screen
interface MatchCandidate extends ReviewItem {
  reviewLabel: string;
  matchStatus: 'TO_REVIEW' | 'CONFIRMED' | 'REJECTED' | 'HANDOVER';
}

// Helper: Format currency
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

// Helper: Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Helper: Get reason label
const getReviewLabel = (item: ReviewItem): string => {
  const amountDelta = Math.abs(item.transactionAmount) - item.documentAmount;
  if (Math.abs(amountDelta) > 0.01) {
    return 'Betrag weicht ab';
  }
  
  const txDate = new Date(item.transactionDate);
  const docDate = new Date(item.documentDate);
  const daysDiff = Math.abs(Math.round((txDate.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24)));
  if (daysDiff > 1) {
    return 'Datum weicht ab';
  }
  
  if (item.reviewReason === 'ambiguous') {
    return 'Mehrere Treffer';
  }
  
  return 'Name unsicher';
};

// Build MatchCandidates from real store data
const buildMatchCandidates = (
  uncertainTxs: Transaction[],
  getDocById: (id: string) => Document | undefined,
): MatchCandidate[] => {
  return uncertainTxs.map(tx => {
    const docId = tx.candidateDocumentIds?.[0] ?? '';
    const doc = docId ? getDocById(docId) : undefined;

    const docAmount = doc?.total ?? Math.abs(tx.amount);
    const docDate = doc?.date ?? tx.date;
    const docName = doc?.supplierName ?? 'Unbekannter Lieferant';

    const amountDelta = Math.abs(Math.abs(tx.amount) - docAmount);
    const txDateMs = new Date(tx.date).getTime();
    const docDateMs = new Date(docDate).getTime();
    const daysDiff = Math.abs(Math.round((txDateMs - docDateMs) / (1000 * 60 * 60 * 24)));

    const reviewReason: ReviewReason =
      amountDelta > 0.01 ? 'amount_deviation'
      : daysDiff > 1 ? 'date_deviation'
      : 'low_confidence';

    const item: ReviewItem = {
      id: tx.id,
      transactionId: tx.id,
      transactionDate: tx.date,
      transactionAmount: tx.amount,
      transactionMerchant: tx.merchant,
      transactionPurpose: tx.purpose ?? '',
      documentId: docId,
      documentName: docName,
      documentDate: docDate,
      documentAmount: docAmount,
      confidence: tx.matchConfidence,
      reviewReason,
      status: 'pending',
    };

    return {
      ...item,
      reviewLabel: getReviewLabel(item),
      matchStatus: 'TO_REVIEW' as const,
    };
  });
};

// Confidence badge component
function ConfidenceBadge({ confidence }: { confidence: number }) {
  const variant = confidence >= 80 
    ? 'border-green-500/30 text-green-600 bg-green-50' 
    : confidence >= 60 
      ? 'border-amber-500/30 text-amber-600 bg-amber-50'
      : 'border-red-500/30 text-red-600 bg-red-50';
  
  return (
    <Badge variant="outline" className={`text-xs font-medium tabular-nums ${variant}`}>
      {confidence}%
    </Badge>
  );
}

// Package keys used for open items count (same as OpenItems.tsx)
const PACKAGE_KEYS = ['top_amounts', 'other_open', 'bundles', 'subscriptions', 'refunds', 'small_no_receipt'];

export default function UncertainMatches() {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [handoverDialogOpen, setHandoverDialogOpen] = useState(false);
  const [showMonthHandoverDialog, setShowMonthHandoverDialog] = useState(false);
  const { goToOpenItemsHandler, goToCompletion } = useWizardNavigation();
  const { packageCounts, getUncertainTransactions, getDocumentById } = useBelegStore();

  const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>(() =>
    buildMatchCandidates(getUncertainTransactions(), getDocumentById)
  );

  // Calculate total open items (same logic as OpenItems.tsx)
  const openItemsCount = PACKAGE_KEYS.reduce((sum, key) => sum + (packageCounts[key] || 0), 0);

  // Filter only TO_REVIEW items
  const pendingItems = useMemo(() => 
    matchCandidates.filter(item => item.matchStatus === 'TO_REVIEW'),
    [matchCandidates]
  );
  
  // Sort by amount (high first), then by confidence (low first)
  const sortedItems = useMemo(() => 
    [...pendingItems].sort((a, b) => {
      const amountDiff = Math.abs(b.transactionAmount) - Math.abs(a.transactionAmount);
      if (amountDiff !== 0) return amountDiff;
      return a.confidence - b.confidence;
    }),
    [pendingItems]
  );
  
  // Stats
  const totalItems = matchCandidates.length;
  const openCount = pendingItems.length;
  
  // Pagination
  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = sortedItems.slice(
    currentPage * ITEMS_PER_PAGE,
    (currentPage + 1) * ITEMS_PER_PAGE
  );
  
  // Selected item
  const selectedItem = useMemo(() => 
    selectedItemId ? matchCandidates.find(item => item.id === selectedItemId && item.matchStatus === 'TO_REVIEW') : null,
    [selectedItemId, matchCandidates]
  );
  
  // Current index in pending items
  const currentItemIndex = useMemo(() => 
    selectedItem ? sortedItems.findIndex(item => item.id === selectedItem.id) : -1,
    [selectedItem, sortedItems]
  );
  
  // Auto-select first item when page loads or items change
  useEffect(() => {
    if (!selectedItem && sortedItems.length > 0) {
      setSelectedItemId(sortedItems[0].id);
    }
  }, [selectedItem, sortedItems]);
  
  // Reset page when items are removed
  useEffect(() => {
    if (currentPage >= totalPages && totalPages > 0) {
      setCurrentPage(totalPages - 1);
    }
  }, [currentPage, totalPages]);
  
  // ESC to close sidepanel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedItemId(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // Close sidepanel
  const closeSidepanel = useCallback(() => {
    setSelectedItemId(null);
  }, []);
  
  // Auto-advance to next
  const autoAdvanceToNext = useCallback(() => {
    if (currentItemIndex < sortedItems.length - 1) {
      setSelectedItemId(sortedItems[currentItemIndex + 1].id);
    } else if (sortedItems.length > 1) {
      setSelectedItemId(sortedItems[0].id);
    } else {
      setSelectedItemId(null);
    }
  }, [currentItemIndex, sortedItems]);

  // Action handlers
  const handleConfirm = useCallback(() => {
    if (!selectedItemId) return;
    setMatchCandidates(prev => 
      prev.map(item => 
        item.id === selectedItemId ? { ...item, matchStatus: 'CONFIRMED' as const } : item
      )
    );
    autoAdvanceToNext();
  }, [selectedItemId, autoAdvanceToNext]);

  const handleReject = useCallback(() => {
    if (!selectedItemId) return;
    setMatchCandidates(prev => 
      prev.map(item => 
        item.id === selectedItemId ? { ...item, matchStatus: 'REJECTED' as const } : item
      )
    );
    autoAdvanceToNext();
  }, [selectedItemId, autoAdvanceToNext]);

  const handleHandover = useCallback((comment: string) => {
    if (!selectedItemId) return;
    setMatchCandidates(prev => 
      prev.map(item => 
        item.id === selectedItemId ? { ...item, matchStatus: 'HANDOVER' as const } : item
      )
    );
    autoAdvanceToNext();
  }, [selectedItemId, autoAdvanceToNext]);

  const handleHandoverAll = useCallback((comment: string) => {
    setMatchCandidates(prev => 
      prev.map(item => 
        item.matchStatus === 'TO_REVIEW' ? { ...item, matchStatus: 'HANDOVER' as const } : item
      )
    );
    setSelectedItemId(null);
    setHandoverDialogOpen(false);
  }, []);

  // Handle month handover
  const handleMonthHandoverConfirm = useCallback(() => {
    setShowMonthHandoverDialog(false);
    goToCompletion();
  }, [goToCompletion]);

  // Navigation
  const navigateToNext = useCallback(() => {
    if (currentItemIndex < sortedItems.length - 1) {
      setSelectedItemId(sortedItems[currentItemIndex + 1].id);
    }
  }, [currentItemIndex, sortedItems]);

  const navigateToPrevious = useCallback(() => {
    if (currentItemIndex > 0) {
      setSelectedItemId(sortedItems[currentItemIndex - 1].id);
    }
  }, [currentItemIndex, sortedItems]);

  const isSidepanelOpen = !!selectedItem || pendingItems.length === 0;

  // Sidepanel content
  const sidepanelContent = pendingItems.length === 0 ? (
    <ReviewClusterComplete 
      totalResolved={totalItems - openCount} 
      onContinue={goToCompletion} 
    />
  ) : selectedItem ? (
    <ReviewInspector
      reviewItem={selectedItem}
      openCount={openCount}
      totalCount={totalItems}
      onClose={closeSidepanel}
      onConfirm={handleConfirm}
      onReject={handleReject}
      onHandover={handleHandover}
      onNext={navigateToNext}
      onPrevious={navigateToPrevious}
      hasNext={currentItemIndex < sortedItems.length - 1}
      hasPrevious={currentItemIndex > 0}
    />
  ) : null;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Main content with DetailPageShell */}
      <div className="flex-1 overflow-hidden">
        <DetailPageShell sidepanel={sidepanelContent} sidepanelOpen={isSidepanelOpen}>
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="py-4 space-y-3 border-b bg-background flex-shrink-0">
              <div className="flex justify-between items-center gap-4">
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold">Zuordnungen kurz prüfen</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Diese Zuordnungen wurden automatisch erkannt, aber wir sind uns nicht ganz sicher.
                  </p>
                </div>
                <Badge variant="warning" className="text-sm px-3 py-1 flex-shrink-0">
                  Noch {openCount} offen
                </Badge>
              </div>
            </div>

            {/* Table or Empty State */}
            <div className="flex-1 overflow-auto py-4">
              <p className="text-xs text-muted-foreground mb-2">
                Klicke auf eine Zeile, um Details anzuzeigen und die Zuordnung zu prüfen.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                    <TableHead className="w-[100px]">Datum</TableHead>
                    <TableHead>Empfänger</TableHead>
                    <TableHead className="text-right w-[120px]">Betrag</TableHead>
                    <TableHead className="w-[160px]">Prüfanlass</TableHead>
                    <TableHead className="w-[80px] text-center">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Check className="h-8 w-8 text-green-500" />
                          <p>Alle Zuordnungen wurden geprüft.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map(item => (
                      <TableRow
                        key={item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        className={`cursor-pointer transition-colors ${
                          selectedItemId === item.id 
                            ? 'bg-primary/5 border-l-2 border-l-primary' 
                            : 'hover:bg-muted/50'
                        }`}
                      >
                        <TableCell className="font-medium tabular-nums">
                          {formatDate(item.transactionDate)}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium truncate max-w-[200px]">
                            {item.transactionMerchant}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(Math.abs(item.transactionAmount))}
                        </TableCell>
                        <TableCell>
                          <Badge variant="warning" className="text-xs font-normal">
                            {item.reviewLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <ConfidenceBadge confidence={item.confidence} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-between items-center mt-3 text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Zurück
                  </Button>
                  <span className="text-muted-foreground tabular-nums">
                    Seite {currentPage + 1} von {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >
                    Weiter
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DetailPageShell>
      </div>

      {/* Unified Wizard Footer */}
      <WizardFooterBar
        onBack={goToOpenItemsHandler}
        backLabel="Zurück"
        onNext={goToCompletion}
        nextLabel="Weiter zum Abschluss"
        onHandoverToKanzlei={() => setShowMonthHandoverDialog(true)}
      />

      {/* Handover All Dialog (individual items) */}
      <CommentDialog
        open={handoverDialogOpen}
        onOpenChange={setHandoverDialogOpen}
        title="Alle Zuordnungen übergeben"
        description="Ihre Kanzlei wird alle verbleibenden Zuordnungen prüfen. Bitte fügen Sie einen kurzen Kommentar hinzu."
        onConfirm={handleHandoverAll}
        confirmLabel="Alle übergeben"
        placeholder="z. B. Keine Zeit mehr, bitte prüfen..."
      />

      {/* Month Handover Dialog */}
      <HandoverMonthDialog
        open={showMonthHandoverDialog}
        onOpenChange={setShowMonthHandoverDialog}
        onConfirm={handleMonthHandoverConfirm}
        openCount={openItemsCount}
        reviewCount={openCount}
      />
    </div>
  );
}
