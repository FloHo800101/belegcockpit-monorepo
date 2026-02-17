import { useState, useMemo, useEffect, useCallback } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
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
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { ReviewInspector, ReviewClusterComplete } from '../../components/ReviewInspector';
import { DetailPageShell } from '../../components/DetailPageShell';
import { ReviewItem, ReviewReason } from '@/data/types';
import { initialReviewItems } from '@/data/mockData';
import { CommentDialog } from '../../components/CommentDialog';

const ITEMS_PER_PAGE = 10;

// Filter chip options
type FilterOption = 'all' | ReviewReason;

export default function ReviewDetail() {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>(initialReviewItems);
  const [showHandoverAll, setShowHandoverAll] = useState(false);
  
  const { goToOpenItemsHandler, monthId } = useWizardNavigation();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Get only pending items
  const pendingItems = useMemo(() => {
    return reviewItems.filter(item => item.status === 'pending');
  }, [reviewItems]);

  // Filter pending items by active filter
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return pendingItems;
    return pendingItems.filter(item => item.reviewReason === activeFilter);
  }, [pendingItems, activeFilter]);

  // Sort: high amount first, then low confidence
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const amountDiff = Math.abs(b.transactionAmount) - Math.abs(a.transactionAmount);
      if (amountDiff !== 0) return amountDiff;
      return a.confidence - b.confidence;
    });
  }, [filteredItems]);

  // Count resolved
  const resolvedCount = reviewItems.filter(item => item.status !== 'pending').length;
  const totalCount = reviewItems.length;

  // Get selected item
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return sortedItems.find(item => item.id === selectedItemId) || null;
  }, [selectedItemId, sortedItems]);

  // Current index
  const currentItemIndex = selectedItem
    ? sortedItems.findIndex(item => item.id === selectedItem.id)
    : -1;

  // Pagination
  const paginatedItems = useMemo(() => {
    return sortedItems.slice(
      currentPage * ITEMS_PER_PAGE,
      (currentPage + 1) * ITEMS_PER_PAGE
    );
  }, [sortedItems, currentPage]);

  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);

  // Close sidepanel
  const closeSidepanel = useCallback(() => {
    setSelectedItemId(null);
  }, []);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedItemId) {
        closeSidepanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedItemId, closeSidepanel]);

  // Auto-advance helper
  const autoAdvanceToNext = () => {
    if (sortedItems.length === 0) {
      setSelectedItemId(null);
      return;
    }

    const currentIdx = selectedItemId 
      ? sortedItems.findIndex(item => item.id === selectedItemId)
      : -1;
    
    if (currentIdx === -1 || currentIdx >= sortedItems.length - 1) {
      setSelectedItemId(sortedItems[0]?.id || null);
    } else {
      setSelectedItemId(sortedItems[currentIdx + 1]?.id || null);
    }
  };

  // Action handlers
  const handleConfirm = (itemId: string) => {
    setReviewItems(items => 
      items.map(item => 
        item.id === itemId ? { ...item, status: 'confirmed' as const } : item
      )
    );
  };

  const handleReject = (itemId: string) => {
    setReviewItems(items => 
      items.map(item => 
        item.id === itemId ? { ...item, status: 'rejected' as const } : item
      )
    );
  };

  const handleHandover = (itemId: string, comment: string) => {
    console.log('Handover:', itemId, comment);
    setReviewItems(items => 
      items.map(item => 
        item.id === itemId ? { ...item, status: 'handed_over' as const } : item
      )
    );
  };

  const handleHandoverAll = (comment: string) => {
    console.log('Handover all with comment:', comment);
    setReviewItems(items => 
      items.map(item => 
        item.status === 'pending' ? { ...item, status: 'handed_over' as const } : item
      )
    );
    setShowHandoverAll(false);
  };

  // When an item is resolved, auto-advance
  useEffect(() => {
    if (selectedItemId && !sortedItems.find(item => item.id === selectedItemId)) {
      autoAdvanceToNext();
    }
  }, [sortedItems, selectedItemId]);

  // Navigation handlers
  const navigateToNext = () => {
    if (currentItemIndex < sortedItems.length - 1) {
      setSelectedItemId(sortedItems[currentItemIndex + 1].id);
    }
  };

  const navigateToPrevious = () => {
    if (currentItemIndex > 0) {
      setSelectedItemId(sortedItems[currentItemIndex - 1].id);
    }
  };

  // Get review reason label
  const getReviewReasonLabel = (reason: ReviewReason) => {
    switch (reason) {
      case 'low_confidence': return 'Unsicher';
      case 'amount_deviation': return 'Betrag';
      case 'date_deviation': return 'Datum';
      case 'classification': return 'Klassifizierung';
      case 'ambiguous': return 'Mehrdeutig';
    }
  };

  const getReviewReasonBadgeClass = (reason: ReviewReason) => {
    switch (reason) {
      case 'low_confidence': return 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400';
      case 'amount_deviation': return 'border-red-500/30 text-red-600 bg-red-50 dark:bg-red-950/50 dark:text-red-400';
      case 'date_deviation': return 'border-orange-500/30 text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400';
      case 'classification': return 'border-purple-500/30 text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400';
      case 'ambiguous': return 'border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400';
    }
  };

  // Filter chip counts
  const filterCounts = useMemo(() => {
    const counts: Record<FilterOption, number> = {
      all: pendingItems.length,
      low_confidence: pendingItems.filter(i => i.reviewReason === 'low_confidence').length,
      amount_deviation: pendingItems.filter(i => i.reviewReason === 'amount_deviation').length,
      date_deviation: pendingItems.filter(i => i.reviewReason === 'date_deviation').length,
      classification: pendingItems.filter(i => i.reviewReason === 'classification').length,
      ambiguous: pendingItems.filter(i => i.reviewReason === 'ambiguous').length,
    };
    return counts;
  }, [pendingItems]);

  // Build sidepanel content
  const sidepanelContent = (() => {
    if (pendingItems.length === 0) {
      return (
        <ReviewClusterComplete
          totalResolved={resolvedCount}
          onContinue={goToOpenItemsHandler}
        />
      );
    }

    if (selectedItem) {
      return (
        <ReviewInspector
          reviewItem={selectedItem}
          openCount={pendingItems.length}
          totalCount={totalCount}
          onClose={closeSidepanel}
          onConfirm={() => handleConfirm(selectedItem.id)}
          onReject={() => handleReject(selectedItem.id)}
          onHandover={(comment) => handleHandover(selectedItem.id, comment)}
          onNext={navigateToNext}
          onPrevious={navigateToPrevious}
          hasNext={currentItemIndex < sortedItems.length - 1}
          hasPrevious={currentItemIndex > 0}
        />
      );
    }

    return null;
  })();

  const isSidepanelOpen = selectedItemId !== null || pendingItems.length === 0;

  return (
    <DetailPageShell sidepanel={sidepanelContent} sidepanelOpen={isSidepanelOpen}>
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="py-4 space-y-3 border-b bg-background flex-shrink-0">
          <Button variant="ghost" size="sm" onClick={goToOpenItemsHandler} className="-ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zur Übersicht
          </Button>
          <div className="flex justify-between items-start gap-4">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold">Zuordnungen kurz prüfen</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Diese Zuordnungen wirken unsicher oder weichen ab. Eine kurze Prüfung hilft Fehler zu vermeiden.
              </p>
            </div>
            <Badge variant="secondary" className="text-sm whitespace-nowrap flex-shrink-0">
              {pendingItems.length} Zuordnungen zu prüfen
            </Badge>
          </div>
          
          {/* Handover All Link */}
          {pendingItems.length > 0 && (
            <button 
              onClick={() => setShowHandoverAll(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline flex items-center gap-1"
            >
              Direkt an Kanzlei übergeben
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        {pendingItems.length > 0 && (
          <div className="flex gap-2 py-3 flex-wrap flex-shrink-0">
            <FilterChip 
              label="Alle" 
              count={filterCounts.all} 
              active={activeFilter === 'all'} 
              onClick={() => setActiveFilter('all')} 
            />
            {filterCounts.low_confidence > 0 && (
              <FilterChip 
                label="Unsicher" 
                count={filterCounts.low_confidence} 
                active={activeFilter === 'low_confidence'} 
                onClick={() => setActiveFilter('low_confidence')} 
              />
            )}
            {filterCounts.amount_deviation > 0 && (
              <FilterChip 
                label="Betrag" 
                count={filterCounts.amount_deviation} 
                active={activeFilter === 'amount_deviation'} 
                onClick={() => setActiveFilter('amount_deviation')} 
              />
            )}
            {filterCounts.date_deviation > 0 && (
              <FilterChip 
                label="Datum" 
                count={filterCounts.date_deviation} 
                active={activeFilter === 'date_deviation'} 
                onClick={() => setActiveFilter('date_deviation')} 
              />
            )}
            {filterCounts.classification > 0 && (
              <FilterChip 
                label="Klassifizierung" 
                count={filterCounts.classification} 
                active={activeFilter === 'classification'} 
                onClick={() => setActiveFilter('classification')} 
              />
            )}
            {filterCounts.ambiguous > 0 && (
              <FilterChip 
                label="Mehrdeutig" 
                count={filterCounts.ambiguous} 
                active={activeFilter === 'ambiguous'} 
                onClick={() => setActiveFilter('ambiguous')} 
              />
            )}
          </div>
        )}

        {/* Table or Empty State */}
        <div className="flex-1 overflow-auto py-2">
          {sortedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-12 h-12 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-[hsl(var(--status-confident))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-medium">Alle Zuordnungen geprüft</p>
              <p className="text-sm text-muted-foreground mt-1">
                {resolvedCount} Zuordnungen wurden bearbeitet.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                Klicke auf eine Zeile, um die Zuordnung zu prüfen.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[90px] whitespace-nowrap">Datum</TableHead>
                      <TableHead className="w-[18%] min-w-[140px]">Empfänger</TableHead>
                      <TableHead className="w-auto">Betreff</TableHead>
                      <TableHead className="text-right w-[100px] whitespace-nowrap">Betrag</TableHead>
                      <TableHead className="w-[18%] min-w-[140px]">Beleg</TableHead>
                      <TableHead className="w-[100px]">Prüfanlass</TableHead>
                      <TableHead className="w-[70px] text-center">Conf.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedItems.map((item) => (
                      <ReviewItemRow
                        key={item.id}
                        item={item}
                        isActive={selectedItemId === item.id}
                        onClick={() => setSelectedItemId(item.id)}
                        formatCurrency={formatCurrency}
                        formatDate={formatDate}
                        getReviewReasonLabel={getReviewReasonLabel}
                        getReviewReasonBadgeClass={getReviewReasonBadgeClass}
                      />
                    ))}
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
                    onClick={() => setCurrentPage((p) => p - 1)}
                  >
                    ← Zurück
                  </Button>
                  <span className="text-muted-foreground">
                    Seite {currentPage + 1} von {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage((p) => p + 1)}
                  >
                    Weiter →
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Handover All Dialog */}
      <CommentDialog
        open={showHandoverAll}
        onOpenChange={setShowHandoverAll}
        title="An Kanzlei übergeben"
        description="Alle verbleibenden Zuordnungen werden zur Prüfung an die Kanzlei übergeben."
        placeholder="z. B. Bitte alle Zuordnungen prüfen, ich bin unsicher..."
        confirmLabel="Alle übergeben"
        onConfirm={handleHandoverAll}
      />
    </DetailPageShell>
  );
}

// Filter chip component
interface FilterChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ label, count, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-full text-xs font-medium transition-colors
        ${active 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
        }
      `}
    >
      {label} ({count})
    </button>
  );
}

// Row component
interface ReviewItemRowProps {
  item: ReviewItem;
  isActive: boolean;
  onClick: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  getReviewReasonLabel: (reason: ReviewReason) => string;
  getReviewReasonBadgeClass: (reason: ReviewReason) => string;
}

function ReviewItemRow({
  item,
  isActive,
  onClick,
  formatCurrency,
  formatDate,
  getReviewReasonLabel,
  getReviewReasonBadgeClass,
}: ReviewItemRowProps) {
  const rowStyles = isActive
    ? 'bg-amber-50 dark:bg-amber-950/30 border-l-[3px] border-l-amber-500'
    : 'hover:bg-amber-50/50 dark:hover:bg-amber-950/20 border-l-[3px] border-l-transparent hover:border-l-amber-400/40';

  return (
    <TableRow
      className={`cursor-pointer transition-colors ${rowStyles}`}
      onClick={onClick}
    >
      <TableCell className="py-2.5 text-sm">{formatDate(item.transactionDate)}</TableCell>
      <TableCell className="py-2.5 font-medium text-sm">
        <span className="line-clamp-1">{item.transactionMerchant}</span>
      </TableCell>
      <TableCell className="py-2.5 text-muted-foreground text-sm">
        <span className="line-clamp-1">{item.transactionPurpose}</span>
      </TableCell>
      <TableCell className="py-2.5 text-right font-medium tabular-nums text-sm">
        {formatCurrency(Math.abs(item.transactionAmount))}
      </TableCell>
      <TableCell className="py-2.5 text-sm">
        <div className="line-clamp-1">
          <span className="font-medium">{item.documentName}</span>
          <span className="text-muted-foreground ml-1">({formatDate(item.documentDate)})</span>
        </div>
      </TableCell>
      <TableCell className="py-2.5">
        <Badge 
          variant="outline" 
          className={`text-xs font-medium ${getReviewReasonBadgeClass(item.reviewReason)}`}
        >
          {getReviewReasonLabel(item.reviewReason)}
        </Badge>
      </TableCell>
      <TableCell className="py-2.5 text-center">
        <Badge 
          variant="outline" 
          className={`text-xs font-medium tabular-nums ${
            item.confidence >= 80 
              ? 'border-green-500/30 text-green-600 bg-green-50 dark:bg-green-950/50' 
              : item.confidence >= 60 
                ? 'border-amber-500/30 text-amber-600 bg-amber-50 dark:bg-amber-950/50'
                : 'border-red-500/30 text-red-600 bg-red-50 dark:bg-red-950/50'
          }`}
        >
          {item.confidence}%
        </Badge>
      </TableCell>
    </TableRow>
  );
}
