import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBelegStore } from '@/store/belegStore';
import { DetailPageShell } from '../components/DetailPageShell';
import { TransactionInspector, ClusterComplete } from '../components/TransactionInspector';
import { RefundInspector, RefundClusterComplete } from '../components/RefundInspector';
import { SmallAmountInspector, SmallAmountClusterComplete } from '../components/SmallAmountInspector';
import { SubscriptionInspector, SubscriptionClusterComplete } from '../components/SubscriptionInspector';
import { BundleInspector, BundleClusterComplete } from '../components/BundleInspector';
import { MandantPackageKey, Transaction } from '@/data/types';

// Cluster definitions - same as OpenItems.tsx
const CLUSTER_DEFINITIONS = [
  {
    id: 'cluster_important_missing_high',
    packageKey: 'top_amounts' as MandantPackageKey,
    priority: 'high' as const,
    priorityLabel: 'Wichtig',
    title: 'Beleg fehlt (hoher Betrag)',
    explanation: 'Bei diesen größeren Zahlungen fehlt noch der Beleg. Bitte zuerst prüfen.',
    clusterType: 'missing' as const,
  },
  {
    id: 'cluster_normal_missing',
    packageKey: 'other_open' as MandantPackageKey,
    priority: 'normal' as const,
    priorityLabel: 'Normal',
    title: 'Beleg fehlt',
    explanation: 'Zu diesen Zahlungen wurde kein passender Beleg gefunden.',
    clusterType: 'missing' as const,
  },
  {
    id: 'cluster_normal_bundle',
    packageKey: 'bundles' as MandantPackageKey,
    priority: 'normal' as const,
    priorityLabel: 'Normal',
    title: 'Sammelzahlungen & Sammelbelege',
    explanation: 'Hier könnten mehrere Zahlungen oder Belege zusammengehören.',
    clusterType: 'bundle' as const,
  },
  {
    id: 'cluster_normal_subscriptions',
    packageKey: 'subscriptions' as MandantPackageKey,
    priority: 'normal' as const,
    priorityLabel: 'Normal',
    title: 'Mögliche Abos & Verträge',
    explanation: 'Diese Zahlungen wiederholen sich regelmäßig – vielleicht ein Abo?',
    clusterType: 'subscription' as const,
  },
  {
    id: 'cluster_low_refund',
    packageKey: 'refunds' as MandantPackageKey,
    priority: 'low' as const,
    priorityLabel: 'Niedrig',
    title: 'Erstattung / Gutschrift',
    explanation: 'Hier kam Geld zurück. Bitte kurz bestätigen, worum es sich handelt.',
    clusterType: 'refund' as const,
  },
  {
    id: 'cluster_low_small',
    packageKey: 'small_no_receipt' as MandantPackageKey,
    priority: 'low' as const,
    priorityLabel: 'Niedrig',
    title: 'Kleinbeträge',
    explanation: 'Kleine Ausgaben wie Parkgebühren oder Trinkgeld – oft ohne Beleg.',
    clusterType: 'small' as const,
  },
];

export default function TestProgressiveDisclosure() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo || '/mandant';
  const { state, dispatch, packageCounts } = useBelegStore();

  // State
  const [openClusterId, setOpenClusterId] = useState<string | undefined>(undefined);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [sidepanelOpen, setSidepanelOpen] = useState(false);

  // Refs for cluster scrolling
  const clusterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Helper functions
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Get open transactions for a cluster
  const getOpenTransactionsForCluster = useCallback((packageKey: MandantPackageKey) => {
    return state.transactions.filter(
      (t) => t.mandantPackageKey === packageKey && t.status === 'missing_receipt'
    );
  }, [state.transactions]);

  // Get all transactions for a cluster (for total count)
  const getAllTransactionsForCluster = useCallback((packageKey: MandantPackageKey) => {
    return state.transactions.filter((t) => t.mandantPackageKey === packageKey);
  }, [state.transactions]);

  // Calculate cluster data with counts
  const clustersWithData = useMemo(() => {
    return CLUSTER_DEFINITIONS.map((cluster) => {
      const allTransactions = getAllTransactionsForCluster(cluster.packageKey);
      const openTransactions = getOpenTransactionsForCluster(cluster.packageKey);
      return {
        ...cluster,
        openCount: openTransactions.length,
        totalCount: allTransactions.length,
        resolvedCount: allTransactions.length - openTransactions.length,
        transactions: openTransactions,
      };
    });
  }, [getAllTransactionsForCluster, getOpenTransactionsForCluster]);

  // Find first cluster with open items (priority order)
  const firstOpenCluster = useMemo(() => {
    return clustersWithData.find((c) => c.openCount > 0);
  }, [clustersWithData]);

  // Initialize open cluster on mount
  useEffect(() => {
    if (!openClusterId && firstOpenCluster) {
      setOpenClusterId(firstOpenCluster.id);
    }
  }, [openClusterId, firstOpenCluster]);

  // Get current cluster data
  const currentCluster = useMemo(() => {
    return clustersWithData.find((c) => c.id === openClusterId);
  }, [clustersWithData, openClusterId]);

  // Get selected transaction
  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    return state.transactions.find((t) => t.id === selectedTransactionId) || null;
  }, [selectedTransactionId, state.transactions]);

  // Current transaction index in current cluster
  const currentTransactionIndex = useMemo(() => {
    if (!currentCluster || !selectedTransactionId) return -1;
    return currentCluster.transactions.findIndex((t) => t.id === selectedTransactionId);
  }, [currentCluster, selectedTransactionId]);

  // Check if all clusters are complete
  const allComplete = useMemo(() => {
    return clustersWithData.every((c) => c.openCount === 0);
  }, [clustersWithData]);

  // Total progress
  const totalOpen = clustersWithData.reduce((sum, c) => sum + c.openCount, 0);
  const totalResolved = clustersWithData.reduce((sum, c) => sum + c.resolvedCount, 0);

  // Current cluster index for navigation
  const currentClusterIndex = useMemo(() => {
    if (!openClusterId) return -1;
    return clustersWithData.findIndex((c) => c.id === openClusterId);
  }, [clustersWithData, openClusterId]);

  // Scroll to cluster helper
  const scrollToCluster = useCallback((clusterId: string) => {
    setTimeout(() => {
      const ref = clusterRefs.current[clusterId];
      if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, []);

  // Cluster navigation
  const goToPreviousCluster = useCallback(() => {
    if (currentClusterIndex > 0) {
      const prevCluster = clustersWithData[currentClusterIndex - 1];
      setOpenClusterId(prevCluster.id);
      setSelectedTransactionId(null);
      setSidepanelOpen(false);
      scrollToCluster(prevCluster.id);
    }
  }, [currentClusterIndex, clustersWithData, scrollToCluster]);

  const goToNextCluster = useCallback(() => {
    if (currentClusterIndex < clustersWithData.length - 1) {
      const nextCluster = clustersWithData[currentClusterIndex + 1];
      setOpenClusterId(nextCluster.id);
      setSelectedTransactionId(null);
      setSidepanelOpen(false);
      scrollToCluster(nextCluster.id);
    }
  }, [currentClusterIndex, clustersWithData, scrollToCluster]);

  // Close sidepanel
  const closeSidepanel = useCallback(() => {
    setSelectedTransactionId(null);
    setSidepanelOpen(false);
  }, []);

  // ESC key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTransactionId) {
        closeSidepanel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransactionId, closeSidepanel]);

  // Auto-advance to next transaction or next cluster
  const autoAdvance = useCallback(() => {
    if (!currentCluster) return;

    const openTxs = currentCluster.transactions.filter(
      (t) => t.status === 'missing_receipt' && t.id !== selectedTransactionId
    );

    if (openTxs.length > 0) {
      // Still have open transactions in current cluster
      setSelectedTransactionId(openTxs[0].id);
    } else {
      // Current cluster is complete, find next cluster with open items
      const currentIndex = clustersWithData.findIndex((c) => c.id === currentCluster.id);
      const nextCluster = clustersWithData.slice(currentIndex + 1).find((c) => c.openCount > 0);

      if (nextCluster) {
        setOpenClusterId(nextCluster.id);
        const nextTxs = getOpenTransactionsForCluster(nextCluster.packageKey);
        if (nextTxs.length > 0) {
          setSelectedTransactionId(nextTxs[0].id);
        }
      } else {
        // All done
        setSelectedTransactionId(null);
        setSidepanelOpen(false);
      }
    }
  }, [currentCluster, clustersWithData, selectedTransactionId, getOpenTransactionsForCluster]);

  // Action handlers
  const handleUploadReceipt = (txId: string, files?: File[]) => {
    dispatch({ type: 'UPLOAD_RECEIPT', payload: { transactionId: txId } });
  };

  const handleEigenbeleg = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_self_receipt' },
    });
  };

  const handleNoReceipt = (txId: string, comment: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
  };

  const handleHandover = (txId: string, comment: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
  };

  const handleConfirmRefund = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  const handleOtherReason = (txId: string, reason: string, comment: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  const handleCashPayment = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
  };

  const handleConfirmSubscription = (txId: string, interval: string, startDate: string, note: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  const handleNoSubscription = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  const handleSaveAssignment = (txId: string, selectedDocIds: string[]) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  // Get candidate documents for bundle transactions
  const getCandidateDocuments = (transaction: Transaction) => {
    if (!transaction.candidateDocumentIds) return [];
    return state.documents
      .filter((doc) => transaction.candidateDocumentIds?.includes(doc.id))
      .map((doc) => ({
        id: doc.id,
        supplierName: doc.supplierName,
        date: doc.date,
        total: doc.total,
      }));
  };

  // Watch for resolved transactions and auto-advance
  useEffect(() => {
    if (selectedTransactionId) {
      const tx = state.transactions.find((t) => t.id === selectedTransactionId);
      if (tx && tx.status !== 'missing_receipt') {
        // Transaction was resolved, auto-advance
        setTimeout(() => autoAdvance(), 100);
      }
    }
  }, [state.transactions, selectedTransactionId, autoAdvance]);

  // Navigation handlers
  const navigateToNextTransaction = () => {
    if (!currentCluster || currentTransactionIndex < 0) return;
    if (currentTransactionIndex < currentCluster.transactions.length - 1) {
      setSelectedTransactionId(currentCluster.transactions[currentTransactionIndex + 1].id);
    }
  };

  const navigateToPreviousTransaction = () => {
    if (!currentCluster || currentTransactionIndex <= 0) return;
    setSelectedTransactionId(currentCluster.transactions[currentTransactionIndex - 1].id);
  };

  // Handle row click
  const handleRowClick = (transactionId: string) => {
    setSelectedTransactionId(transactionId);
    setSidepanelOpen(true);
  };

  // Handle accordion change
  const handleAccordionChange = (value: string) => {
    setOpenClusterId(value || undefined);
    setSelectedTransactionId(null);
    setSidepanelOpen(false);
  };

  // Build sidepanel content
  const sidepanelContent = useMemo(() => {
    if (!currentCluster) return null;

    const { clusterType, openCount, totalCount, resolvedCount, title, explanation } = currentCluster;
    const isRefund = clusterType === 'refund';
    const isSmall = clusterType === 'small';
    const isSubscription = clusterType === 'subscription';
    const isBundle = clusterType === 'bundle';

    // Cluster complete state
    if (openCount === 0) {
      if (isRefund) {
        return <RefundClusterComplete totalResolved={resolvedCount} onContinue={() => {
          const next = clustersWithData.find((c) => c.id !== currentCluster.id && c.openCount > 0);
          if (next) {
            setOpenClusterId(next.id);
          }
        }} />;
      }
      if (isSmall) {
        return <SmallAmountClusterComplete totalResolved={resolvedCount} onContinue={() => {
          const next = clustersWithData.find((c) => c.id !== currentCluster.id && c.openCount > 0);
          if (next) {
            setOpenClusterId(next.id);
          }
        }} />;
      }
      if (isSubscription) {
        return <SubscriptionClusterComplete totalResolved={resolvedCount} onContinue={() => {
          const next = clustersWithData.find((c) => c.id !== currentCluster.id && c.openCount > 0);
          if (next) {
            setOpenClusterId(next.id);
          }
        }} />;
      }
      if (isBundle) {
        return <BundleClusterComplete totalResolved={resolvedCount} onContinue={() => {
          const next = clustersWithData.find((c) => c.id !== currentCluster.id && c.openCount > 0);
          if (next) {
            setOpenClusterId(next.id);
          }
        }} />;
      }
      return <ClusterComplete clusterTitle={title} totalResolved={resolvedCount} onContinue={() => {
        const next = clustersWithData.find((c) => c.id !== currentCluster.id && c.openCount > 0);
        if (next) {
          setOpenClusterId(next.id);
        }
      }} />;
    }

    // Transaction inspector
    if (selectedTransaction) {
      const hasNext = currentTransactionIndex < currentCluster.transactions.length - 1;
      const hasPrevious = currentTransactionIndex > 0;

      if (isRefund) {
        return (
          <RefundInspector
            transaction={selectedTransaction}
            openCount={openCount}
            totalCount={totalCount}
            onClose={closeSidepanel}
            onConfirmRefund={() => handleConfirmRefund(selectedTransaction.id)}
            onOtherReason={(reason, comment) => handleOtherReason(selectedTransaction.id, reason, comment)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
          />
        );
      }

      if (isSmall) {
        return (
          <SmallAmountInspector
            transaction={selectedTransaction}
            openCount={openCount}
            totalCount={totalCount}
            onClose={closeSidepanel}
            onEigenbeleg={() => handleEigenbeleg(selectedTransaction.id)}
            onCashPayment={() => handleCashPayment(selectedTransaction.id)}
            onUpload={(files) => handleUploadReceipt(selectedTransaction.id, files)}
            onNoReceipt={(comment) => handleNoReceipt(selectedTransaction.id, comment)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
          />
        );
      }

      if (isSubscription) {
        return (
          <SubscriptionInspector
            transaction={selectedTransaction}
            openCount={openCount}
            totalCount={totalCount}
            onClose={closeSidepanel}
            onConfirmSubscription={(interval, startDate, note) =>
              handleConfirmSubscription(selectedTransaction.id, interval, startDate, note)
            }
            onNoSubscription={() => handleNoSubscription(selectedTransaction.id)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
          />
        );
      }

      if (isBundle) {
        const candidateDocs = getCandidateDocuments(selectedTransaction);
        return (
          <BundleInspector
            transaction={selectedTransaction}
            candidateDocuments={candidateDocs}
            openCount={openCount}
            totalCount={totalCount}
            onClose={closeSidepanel}
            onSaveAssignment={(docIds) => handleSaveAssignment(selectedTransaction.id, docIds)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={hasNext}
            hasPrevious={hasPrevious}
          />
        );
      }

      // Default: missing receipt inspector
      const effectivePriority = currentCluster.priority === 'high' ? 'high' : 'normal';
      return (
        <TransactionInspector
          transaction={selectedTransaction}
          clusterTitle={title}
          clusterDescription={explanation}
          openCount={openCount}
          totalCount={totalCount}
          priority={effectivePriority}
          onClose={closeSidepanel}
          onUpload={(files) => handleUploadReceipt(selectedTransaction.id, files)}
          onEigenbeleg={() => handleEigenbeleg(selectedTransaction.id)}
          onNoReceipt={(comment) => handleNoReceipt(selectedTransaction.id, comment)}
          onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
          onNext={navigateToNextTransaction}
          onPrevious={navigateToPreviousTransaction}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
        />
      );
    }

    return null;
  }, [currentCluster, selectedTransaction, currentTransactionIndex, clustersWithData, closeSidepanel]);

  // Priority badge variant
  const getPriorityBadgeVariant = (priority: string): 'destructive' | 'default' | 'secondary' => {
    switch (priority) {
      case 'high':
        return 'destructive';
      case 'normal':
        return 'default';
      default:
        return 'secondary';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-6 py-4 flex-shrink-0">
        <div className="max-w-[1720px] mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to={returnTo}>
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
                </Button>
              </Link>
              <div>
                <h1 className="text-lg font-semibold">Offene Punkte – Progressive Disclosure (Test)</h1>
                <p className="text-sm text-muted-foreground">
                  {allComplete
                    ? 'Alle Punkte erledigt 🎉'
                    : `Noch ${totalOpen} von ${totalOpen + totalResolved} offen`}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-sm">
              Test-Screen
            </Badge>
          </div>
        </div>
      </header>

      {/* Sticky Focus Bar */}
      {!allComplete && currentCluster && (
        <div className="sticky top-0 z-20 bg-muted/40 backdrop-blur-sm border-b shadow-sm flex-shrink-0 overflow-hidden">
          {/* Priority accent band */}
          <div 
            className={`absolute left-0 top-0 bottom-0 w-1.5 ${
              currentCluster.priority === 'high' 
                ? 'bg-red-500/70' 
                : currentCluster.priority === 'normal'
                ? 'bg-blue-500/60'
                : 'bg-slate-400/70'
            }`}
          />
          
          <div className="max-w-[1720px] mx-auto px-6 lg:px-8 py-3 pl-8">
            <div className="flex items-center justify-between gap-4">
              {/* Left: Current cluster info */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-muted-foreground whitespace-nowrap">Du bist hier:</span>
                <span className="font-medium truncate">{currentCluster.title}</span>
                <Badge variant={getPriorityBadgeVariant(currentCluster.priority)} className="text-xs flex-shrink-0">
                  {currentCluster.priorityLabel}
                </Badge>
              </div>

              {/* Middle: Progress */}
              <div className="flex flex-col items-center flex-shrink-0">
                {currentCluster.openCount === 0 ? (
                  <span className="font-medium text-[hsl(var(--status-confident))] flex items-center gap-1.5">
                    <Check className="h-4 w-4" />
                    Cluster erledigt
                  </span>
                ) : (
                  <span className="font-medium">
                    Noch {currentCluster.openCount} von {currentCluster.totalCount} offen
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Gesamt: Noch {totalOpen} von {totalOpen + totalResolved} offen
                </span>
              </div>

              {/* Right: Cluster navigation */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={currentClusterIndex <= 0}
                  onClick={goToPreviousCluster}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Vorheriger Cluster
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/30 text-primary hover:text-primary hover:bg-primary/5"
                  disabled={currentClusterIndex >= clustersWithData.length - 1}
                  onClick={goToNextCluster}
                >
                  Nächster Cluster
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <DetailPageShell
          sidepanel={sidepanelContent}
          sidepanelOpen={sidepanelOpen || (currentCluster?.openCount === 0 && !allComplete)}
        >
          <div className="h-full flex flex-col overflow-hidden py-4">
            {allComplete ? (
              /* All complete state */
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-6">
                  <Check className="h-8 w-8 text-[hsl(var(--status-confident))]" />
                </div>
                <h2 className="text-2xl font-semibold mb-2">Alle offenen Punkte erledigt!</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Du hast alle {totalResolved} Zahlungen in allen Kategorien geklärt.
                </p>
                <Button onClick={() => navigate('/mandant/wizard/uncertain-matches')}>
                  Weiter zu Zu prüfende Punkte <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : (
              /* Accordion list */
              <div className="flex-1 overflow-auto px-1">
                <p className="text-xs text-muted-foreground mb-3">
                  Arbeite die Kategorien von oben nach unten ab. Klicke auf eine Zahlung, um sie zu klären.
                </p>
                <Accordion
                  type="single"
                  collapsible
                  value={openClusterId}
                  onValueChange={handleAccordionChange}
                  className="space-y-2"
                >
                  {clustersWithData.map((cluster) => {
                    const isComplete = cluster.openCount === 0;
                    const isOpen = openClusterId === cluster.id;

                    return (
                      <AccordionItem
                        key={cluster.id}
                        value={cluster.id}
                        ref={(el) => { clusterRefs.current[cluster.id] = el as HTMLDivElement | null; }}
                        className={`border rounded-lg overflow-hidden transition-colors ${
                          isComplete
                            ? 'bg-muted/30 border-muted'
                            : isOpen
                            ? 'border-primary/50 bg-primary/[0.02]'
                            : 'hover:border-primary/30'
                        }`}
                      >
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-2">
                            <div className="flex items-center gap-3">
                              {isComplete ? (
                                <div className="w-5 h-5 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center">
                                  <Check className="h-3 w-3 text-[hsl(var(--status-confident))]" />
                                </div>
                              ) : (
                                <Badge variant={getPriorityBadgeVariant(cluster.priority)} className="text-xs">
                                  {cluster.priorityLabel}
                                </Badge>
                              )}
                              <span className={`font-medium ${isComplete ? 'text-muted-foreground' : ''}`}>
                                {cluster.title}
                              </span>
                            </div>
                            <span
                              className={`text-sm tabular-nums ${
                                isComplete ? 'text-muted-foreground' : 'text-foreground'
                              }`}
                            >
                              {isComplete
                                ? 'Erledigt'
                                : `Noch ${cluster.openCount} von ${cluster.totalCount} offen`}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <p className="text-sm text-muted-foreground mb-4">{cluster.explanation}</p>

                          {cluster.transactions.length === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">
                              <Check className="h-8 w-8 mx-auto mb-2 text-[hsl(var(--status-confident))]" />
                              <p>Alle Zahlungen in dieser Kategorie sind geklärt.</p>
                            </div>
                          ) : (
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/30">
                                    <TableHead className="w-[100px]">Datum</TableHead>
                                    <TableHead className="w-[22%]">Empfänger / Sender</TableHead>
                                    <TableHead>Verwendungszweck</TableHead>
                                    <TableHead className="text-right w-[110px]">Betrag</TableHead>
                                    <TableHead className="w-[100px]">Beleg</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {cluster.transactions.slice(0, 10).map((tx) => {
                                    const isActive = selectedTransactionId === tx.id;
                                    const isRefund = cluster.clusterType === 'refund';

                                    return (
                                      <TableRow
                                        key={tx.id}
                                        className={`cursor-pointer transition-colors ${
                                          isActive
                                            ? 'bg-primary/10 border-l-[3px] border-l-primary'
                                            : 'hover:bg-muted/50 border-l-[3px] border-l-transparent hover:border-l-primary/30'
                                        }`}
                                        onClick={() => handleRowClick(tx.id)}
                                      >
                                        <TableCell className="py-3 text-sm">
                                          {formatDate(tx.date)}
                                        </TableCell>
                                        <TableCell className="py-3 font-medium">{tx.merchant}</TableCell>
                                        <TableCell className="py-3 text-muted-foreground text-sm">
                                          <span className="line-clamp-1">{tx.purpose || '–'}</span>
                                        </TableCell>
                                        <TableCell
                                          className={`py-3 text-right font-medium tabular-nums ${
                                            isRefund ? 'text-[hsl(var(--status-confident))]' : ''
                                          }`}
                                        >
                                          {isRefund && tx.amount > 0 ? '+' : ''}
                                          {formatCurrency(tx.amount)}
                                        </TableCell>
                                        <TableCell className="py-3">
                                          <Badge
                                            variant={cluster.priority === 'high' ? 'destructive' : 'secondary'}
                                            className="text-xs"
                                          >
                                            fehlt
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                              {cluster.transactions.length > 10 && (
                                <div className="px-4 py-2 text-sm text-muted-foreground bg-muted/20 border-t">
                                  + {cluster.transactions.length - 10} weitere Zahlungen
                                </div>
                              )}
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </div>
        </DetailPageShell>
      </div>
    </div>
  );
}
