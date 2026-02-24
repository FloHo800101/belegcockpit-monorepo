import { useState, useMemo, useEffect, useCallback } from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { ArrowLeft, Upload } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBelegStore } from '@/store/belegStore';
import { resolveTransaction } from '@/lib/documentApi';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { useEigenbelegDialog } from './WizardLayout';
import { TransactionInspector, ClusterComplete } from '../../components/TransactionInspector';
import { RefundInspector, RefundClusterComplete } from '../../components/RefundInspector';
import { SmallAmountInspector, SmallAmountClusterComplete } from '../../components/SmallAmountInspector';
import { SubscriptionInspector, SubscriptionClusterComplete } from '../../components/SubscriptionInspector';
import { BundleInspector, BundleClusterComplete } from '../../components/BundleInspector';
import { DetailPageShell } from '../../components/DetailPageShell';
import { MandantPackageKey, Transaction, Document } from '@/data/types';

const ITEMS_PER_PAGE = 10;

// Map cluster IDs to package keys
const CLUSTER_TO_PACKAGE: Record<string, MandantPackageKey> = {
  'cluster_important_missing_high': 'top_amounts',
  'cluster_missing_small': 'small_no_receipt',
  'cluster_monthly_invoices': 'monthly_invoices',
  'cluster_marketplace': 'marketplace_statement',
  'cluster_other_open': 'other_open',
  'cluster_missing_normal': 'other_open',
  'cluster_normal_missing': 'other_open',

  // Refund / Credit (aliases)
  'cluster_refunds': 'refunds',
  'cluster_low_refund': 'refunds',

  // Small amounts (aliases)
  'cluster_low_small': 'small_no_receipt',

  // Subscriptions (aliases)
  'cluster_normal_subscriptions': 'subscriptions',
  'cluster_subscriptions': 'subscriptions',

  // Bundles (aliases)
  'cluster_normal_bundle': 'bundles',
  'cluster_bundles': 'bundles',
};

// Cluster metadata
const CLUSTER_META: Record<
  string,
  { title: string; subtitle: string; priority?: 'high' | 'normal' | 'low'; clusterType?: 'missing' | 'refund' | 'small' | 'subscription' | 'bundle' }
> = {
  'cluster_important_missing_high': {
    title: 'Beleg fehlt (hoher Betrag)',
    subtitle: 'Belege fehlen bei wichtigen Zahlungen. Diese Punkte sind relevant für den Monatsabschluss.',
    priority: 'high',
    clusterType: 'missing',
  },
  'cluster_missing_normal': {
    title: 'Beleg fehlt',
    subtitle: 'Für diese Zahlungen fehlt ein Beleg. Ohne Klärung bleibt der Monat unvollständig.',
    priority: 'normal',
    clusterType: 'missing',
  },
  'cluster_normal_missing': {
    title: 'Beleg fehlt',
    subtitle: 'Für diese Zahlungen fehlt ein Beleg. Ohne Klärung bleibt der Monat unvollständig.',
    priority: 'normal',
    clusterType: 'missing',
  },
  'cluster_missing_small': {
    title: 'Kleinbeträge',
    subtitle: 'Kleine Zahlungen ohne Beleg (z. B. Parkgebühren, Trinkgeld). Bitte kurz auswählen.',
    priority: 'low',
    clusterType: 'small',
  },
  'cluster_low_small': {
    title: 'Kleinbeträge',
    subtitle: 'Kleine Zahlungen ohne Beleg (z. B. Parkgebühren, Trinkgeld). Bitte kurz auswählen.',
    priority: 'low',
    clusterType: 'small',
  },
  'cluster_monthly_invoices': {
    title: 'Wiederkehrende Zahlungen',
    subtitle: 'Regelmäßige Rechnungen von bekannten Anbietern.',
    priority: 'normal',
    clusterType: 'missing',
  },
  'cluster_marketplace': {
    title: 'Sammelzahlungen',
    subtitle: 'Zahlungen von Plattformen wie Amazon oder PayPal.',
    priority: 'normal',
    clusterType: 'missing',
  },
  'cluster_other_open': {
    title: 'Sonstige offene Posten',
    subtitle: 'Weitere Zahlungen, die noch geklärt werden müssen.',
    priority: 'normal',
    clusterType: 'missing',
  },

  // Refund / Credit (aliases)
  'cluster_refunds': {
    title: 'Erstattung / Gutschrift',
    subtitle: 'Hier kam Geld zurück. Bitte kurz bestätigen, worum es sich handelt.',
    priority: 'low',
    clusterType: 'refund',
  },
  'cluster_low_refund': {
    title: 'Erstattung / Gutschrift',
    subtitle: 'Hier kam Geld zurück. Bitte kurz bestätigen, worum es sich handelt.',
    priority: 'low',
    clusterType: 'refund',
  },

  // Subscriptions
  'cluster_normal_subscriptions': {
    title: 'Mögliche Abos & Verträge',
    subtitle: 'Diese Zahlungen könnten regelmäßig sein. Bitte kurz bestätigen oder korrigieren.',
    priority: 'normal',
    clusterType: 'subscription',
  },
  'cluster_subscriptions': {
    title: 'Mögliche Abos & Verträge',
    subtitle: 'Diese Zahlungen könnten regelmäßig sein. Bitte kurz bestätigen oder korrigieren.',
    priority: 'normal',
    clusterType: 'subscription',
  },

  // Bundles
  'cluster_normal_bundle': {
    title: 'Sammelzahlungen & Sammelbelege',
    subtitle: 'Zahlungen und Belege könnten zusammengehören. Bitte zuordnen.',
    priority: 'normal',
    clusterType: 'bundle',
  },
  'cluster_bundles': {
    title: 'Sammelzahlungen & Sammelbelege',
    subtitle: 'Zahlungen und Belege könnten zusammengehören. Bitte zuordnen.',
    priority: 'normal',
    clusterType: 'bundle',
  },
};

// Resolved statuses that mark a transaction as "done"
const RESOLVED_STATUSES = ['matched_confident', 'matched_uncertain', 'resolved_no_receipt', 'resolved_self_receipt', 'resolved_private'];

export default function ClusterDetail() {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const { state, dispatch, getTransactionsByPackage, getMerchantsByPackage, getDocumentForTransaction } = useBelegStore();
  const { clusterId, goToOpenItemsHandler, goToUncertainMatches, monthId } = useWizardNavigation();
  const { openEigenbelegDialog } = useEigenbelegDialog();

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Get package key from cluster ID
  const packageKey = clusterId ? CLUSTER_TO_PACKAGE[clusterId] : undefined;
  const clusterMeta = clusterId ? CLUSTER_META[clusterId] : undefined;

  // Get ALL transactions for this cluster (for total count)
  const allClusterTransactions = useMemo(() => {
    if (!packageKey) return [];
    return state.transactions.filter(t => t.mandantPackageKey === packageKey);
  }, [packageKey, state.transactions]);

  // Get only OPEN transactions (status = missing_receipt)
  const openTransactions = useMemo(() => {
    return allClusterTransactions.filter(t => t.status === 'missing_receipt');
  }, [allClusterTransactions]);

  // Count resolved
  const resolvedCount = allClusterTransactions.length - openTransactions.length;
  const totalCount = allClusterTransactions.length;

  // Get selected transaction object
  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId) return null;
    return openTransactions.find(t => t.id === selectedTransactionId) || null;
  }, [selectedTransactionId, openTransactions]);

  // Current index in open transactions
  const currentTransactionIndex = selectedTransaction
    ? openTransactions.findIndex(t => t.id === selectedTransaction.id)
    : -1;

  // Pagination - only show open transactions
  const paginatedTransactions = useMemo(() => {
    return openTransactions.slice(
      currentPage * ITEMS_PER_PAGE,
      (currentPage + 1) * ITEMS_PER_PAGE
    );
  }, [openTransactions, currentPage]);

  const totalPages = Math.ceil(openTransactions.length / ITEMS_PER_PAGE);

  // Close sidepanel handler
  const closeSidepanel = useCallback(() => {
    setSelectedTransactionId(null);
  }, []);

  // ESC key handler to close sidepanel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTransactionId) {
        closeSidepanel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedTransactionId, closeSidepanel]);

  // Auto-advance helper: find next open transaction
  const autoAdvanceToNext = () => {
    if (openTransactions.length === 0) {
      // All done - clear selection, will show complete state
      setSelectedTransactionId(null);
      return;
    }

    // If current is still in list, move to next; otherwise pick first available
    const currentIdx = selectedTransactionId 
      ? openTransactions.findIndex(t => t.id === selectedTransactionId)
      : -1;
    
    if (currentIdx === -1 || currentIdx >= openTransactions.length - 1) {
      // Current was resolved or at end, pick first
      setSelectedTransactionId(openTransactions[0]?.id || null);
    } else {
      // Move to next
      setSelectedTransactionId(openTransactions[currentIdx + 1]?.id || null);
    }
  };

  // Action handlers with auto-advance
  const handleUploadReceipt = (txId: string, files?: File[]) => {
    // In a real app, we'd upload the files here
    console.log('Uploading files for transaction:', txId, files);
    dispatch({ type: 'UPLOAD_RECEIPT', payload: { transactionId: txId } });
    // Auto-advance happens via useEffect when openTransactions updates
  };

  const handleEigenbeleg = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_self_receipt' },
    });
    resolveTransaction(txId, 'self_receipt').catch(console.error);
  };

  const handleNoReceipt = (txId: string, comment: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
    resolveTransaction(txId, 'no_receipt').catch(console.error);
  };

  const handleHandover = (txId: string, comment: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
    resolveTransaction(txId, 'no_receipt').catch(console.error);
  };

  // Refund action handlers
  const handleConfirmRefund = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
    resolveTransaction(txId, 'refund_confirmed').catch(console.error);
  };

  const handleOtherReason = (txId: string, reason: string, comment: string) => {
    console.log('Other reason:', txId, reason, comment);
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
    resolveTransaction(txId, 'refund_confirmed').catch(console.error);
  };

  // Small amount action handler
  const handleCashPayment = (txId: string) => {
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'resolved_no_receipt' },
    });
    resolveTransaction(txId, 'no_receipt').catch(console.error);
  };

  const isRefundCluster = clusterMeta?.clusterType === 'refund';
  const isSmallAmountCluster = clusterMeta?.clusterType === 'small';
  const isSubscriptionCluster = clusterMeta?.clusterType === 'subscription';
  const isBundleCluster = clusterMeta?.clusterType === 'bundle';

  // Subscription action handlers
  const handleConfirmSubscription = (txId: string, interval: string, startDate: string, note: string) => {
    console.log('Subscription confirmed:', txId, interval, startDate, note);
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

  // Bundle action handlers
  const handleSaveAssignment = (txId: string, selectedDocIds: string[]) => {
    console.log('Bundle assignment saved:', txId, selectedDocIds);
    dispatch({
      type: 'UPDATE_TRANSACTION_STATUS',
      payload: { id: txId, status: 'matched_confident' },
    });
  };

  // Get candidate documents for bundle transactions
  const getCandidateDocuments = (transaction: Transaction) => {
    if (!transaction.candidateDocumentIds) return [];
    return state.documents
      .filter(doc => transaction.candidateDocumentIds?.includes(doc.id))
      .map(doc => ({
        id: doc.id,
        supplierName: doc.supplierName,
        date: doc.date,
        total: doc.total,
      }));
  };

  // When a transaction is resolved, auto-advance to next
  useEffect(() => {
    if (selectedTransactionId && !openTransactions.find(t => t.id === selectedTransactionId)) {
      // Selected transaction was resolved, advance
      autoAdvanceToNext();
    }
  }, [openTransactions, selectedTransactionId]);

  // Navigation handlers
  const navigateToNextTransaction = () => {
    if (currentTransactionIndex < openTransactions.length - 1) {
      setSelectedTransactionId(openTransactions[currentTransactionIndex + 1].id);
    }
  };

  const navigateToPreviousTransaction = () => {
    if (currentTransactionIndex > 0) {
      setSelectedTransactionId(openTransactions[currentTransactionIndex - 1].id);
    }
  };

  if (!clusterId || !packageKey) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={goToOpenItemsHandler}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zur Übersicht
        </Button>
        <p className="mt-4 text-muted-foreground">Cluster nicht gefunden.</p>
      </div>
    );
  }

  // Special handling for monthly invoices - group by merchant
  if (clusterId === 'cluster_monthly_invoices') {
    const merchants = getMerchantsByPackage('monthly_invoices');
    return (
      <div className="flex flex-col h-full">
        <div className="p-6 space-y-4 flex-1 overflow-auto">
          <Button variant="ghost" onClick={goToOpenItemsHandler}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zur Übersicht
          </Button>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-semibold">{clusterMeta?.title}</h2>
              <p className="text-muted-foreground mt-1">{clusterMeta?.subtitle}</p>
            </div>
            <Badge variant="secondary" className="text-sm">
              {openTransactions.length} offene Zahlungen
            </Badge>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {merchants.map(({ merchant, count }) => (
              <Card key={merchant} className="p-4">
                <div className="font-medium">{merchant}</div>
                <div className="text-sm text-muted-foreground mb-3">{count} Zahlungen</div>
                <Button
                  size="sm"
                  onClick={() => {
                    openTransactions
                      .filter((t) => t.merchant === merchant)
                      .forEach((t) => handleUploadReceipt(t.id));
                  }}
                >
                  <Upload className="mr-2 h-4 w-4" /> Rechnung hochladen
                </Button>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Build the sidepanel content
  const sidepanelContent = (() => {
    // Cluster complete state
    if (openTransactions.length === 0) {
      if (isRefundCluster) {
        return (
          <RefundClusterComplete
            totalResolved={resolvedCount}
            onContinue={goToOpenItemsHandler}
          />
        );
      }
      if (isSmallAmountCluster) {
        return (
          <SmallAmountClusterComplete
            totalResolved={resolvedCount}
            onContinue={goToOpenItemsHandler}
          />
        );
      }
      if (isSubscriptionCluster) {
        return (
          <SubscriptionClusterComplete
            totalResolved={resolvedCount}
            onContinue={goToOpenItemsHandler}
          />
        );
      }
      if (isBundleCluster) {
        return (
          <BundleClusterComplete
            totalResolved={resolvedCount}
            onContinue={goToOpenItemsHandler}
          />
        );
      }
      return (
        <ClusterComplete
          clusterTitle={clusterMeta?.title || 'Cluster'}
          totalResolved={resolvedCount}
          onContinue={goToOpenItemsHandler}
        />
      );
    }

    // Transaction inspector
    if (selectedTransaction) {
      // Refund cluster uses RefundInspector
      if (isRefundCluster) {
        return (
          <RefundInspector
            transaction={selectedTransaction}
            openCount={openTransactions.length}
            totalCount={totalCount}
            onClose={() => setSelectedTransactionId(null)}
            onConfirmRefund={() => handleConfirmRefund(selectedTransaction.id)}
            onOtherReason={(reason, comment) => handleOtherReason(selectedTransaction.id, reason, comment)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={currentTransactionIndex < openTransactions.length - 1}
            hasPrevious={currentTransactionIndex > 0}
          />
        );
      }

      // Small amount cluster uses SmallAmountInspector
      if (isSmallAmountCluster) {
        return (
          <SmallAmountInspector
            transaction={selectedTransaction}
            openCount={openTransactions.length}
            totalCount={totalCount}
            onClose={() => setSelectedTransactionId(null)}
            onEigenbeleg={() => openEigenbelegDialog(selectedTransaction.id)}
            onCashPayment={() => handleCashPayment(selectedTransaction.id)}
            onUpload={(files) => handleUploadReceipt(selectedTransaction.id, files)}
            onNoReceipt={(comment) => handleNoReceipt(selectedTransaction.id, comment)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={currentTransactionIndex < openTransactions.length - 1}
            hasPrevious={currentTransactionIndex > 0}
          />
        );
      }

      // Subscription cluster uses SubscriptionInspector
      if (isSubscriptionCluster) {
        return (
          <SubscriptionInspector
            transaction={selectedTransaction}
            openCount={openTransactions.length}
            totalCount={totalCount}
            onClose={() => setSelectedTransactionId(null)}
            onConfirmSubscription={(interval, startDate, note) => handleConfirmSubscription(selectedTransaction.id, interval, startDate, note)}
            onNoSubscription={() => handleNoSubscription(selectedTransaction.id)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={currentTransactionIndex < openTransactions.length - 1}
            hasPrevious={currentTransactionIndex > 0}
          />
        );
      }

      // Bundle cluster uses BundleInspector
      if (isBundleCluster) {
        const candidateDocs = getCandidateDocuments(selectedTransaction);
        return (
          <BundleInspector
            transaction={selectedTransaction}
            candidateDocuments={candidateDocs}
            openCount={openTransactions.length}
            totalCount={totalCount}
            onClose={() => setSelectedTransactionId(null)}
            onSaveAssignment={(docIds) => handleSaveAssignment(selectedTransaction.id, docIds)}
            onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
            onNext={navigateToNextTransaction}
            onPrevious={navigateToPreviousTransaction}
            hasNext={currentTransactionIndex < openTransactions.length - 1}
            hasPrevious={currentTransactionIndex > 0}
          />
        );
      }
      const effectivePriority = clusterMeta?.priority === 'high' ? 'high' : 'normal';
      const linkedDocument = getDocumentForTransaction(selectedTransaction.id);
      return (
        <TransactionInspector
          transaction={selectedTransaction}
          clusterTitle={clusterMeta?.title || 'Offene Aufgabe'}
          clusterDescription={clusterMeta?.subtitle || 'Für diese Zahlung fehlt ein Beleg. Ohne Klärung bleibt der Monat unvollständig.'}
          openCount={openTransactions.length}
          totalCount={totalCount}
          priority={effectivePriority}
          onClose={() => setSelectedTransactionId(null)}
          onUpload={(files) => handleUploadReceipt(selectedTransaction.id, files)}
          onEigenbeleg={() => openEigenbelegDialog(selectedTransaction.id)}
          onNoReceipt={(comment) => handleNoReceipt(selectedTransaction.id, comment)}
          onHandover={(comment) => handleHandover(selectedTransaction.id, comment)}
          onNext={navigateToNextTransaction}
          onPrevious={navigateToPreviousTransaction}
          hasNext={currentTransactionIndex < openTransactions.length - 1}
          hasPrevious={currentTransactionIndex > 0}
          linkedDocument={linkedDocument}
        />
      );
    }

    return null;
  })();

  // Determine if sidepanel should be open
  const isSidepanelOpen = selectedTransactionId !== null || openTransactions.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Main content area with DetailPageShell */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <DetailPageShell sidepanel={sidepanelContent} sidepanelOpen={isSidepanelOpen}>
          {/* Main Content - Table Area */}
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="py-4 space-y-3 border-b bg-background flex-shrink-0">
              <Button size="sm" onClick={goToOpenItemsHandler} className="-ml-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <ArrowLeft className="mr-2 h-4 w-4" /> Zurück zu Offene Punkte
              </Button>
              <div className="flex justify-between items-center gap-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold">{clusterMeta?.title || clusterId}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {clusterMeta?.subtitle || 'Für diese Zahlungen fehlt ein Beleg. Ohne Klärung bleibt der Monat unvollständig.'}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/50 dark:border-amber-800/30 flex-shrink-0 min-w-[200px]">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                        Noch {openTransactions.length} von {totalCount}{' '}
                        {isRefundCluster 
                          ? 'Erstattungen zu prüfen'
                          : isSmallAmountCluster
                            ? 'Kleinbeträge offen'
                            : isSubscriptionCluster
                              ? 'Zuordnungen zu prüfen'
                              : isBundleCluster
                                ? 'Zuordnungen offen'
                                : 'Zahlungen ohne Beleg'
                        }
                      </p>
                      <p className="text-xs text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                        {resolvedCount} bereits erledigt
                      </p>
                      <Progress 
                        value={totalCount > 0 ? (resolvedCount / totalCount) * 100 : 0} 
                        className="h-1.5 mt-2 bg-amber-200/50 dark:bg-amber-800/30"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Table or Empty State */}
            <div className="flex-1 overflow-auto py-4">
              {openTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-12 h-12 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-4">
                    <svg className="h-6 w-6 text-[hsl(var(--status-confident))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium">Alle Zahlungen geklärt</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {resolvedCount} Zahlungen wurden in diesem Cluster bearbeitet.
                  </p>
                </div>
              ) : (
                <>
                  {/* Hint for click interaction */}
                  <p className="text-xs text-muted-foreground mb-2">
                    Klicke auf eine Zeile, um Details anzuzeigen und die Zahlung zu klären.
                  </p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="w-[100px] whitespace-nowrap">Datum</TableHead>
                          <TableHead className="w-[22%] min-w-[160px]">Empfänger / Sender</TableHead>
                          <TableHead className="w-auto">Verwendungszweck</TableHead>
                          <TableHead className="text-right w-[110px] whitespace-nowrap">Betrag</TableHead>
                          <TableHead className="w-[120px] whitespace-nowrap">
                            {isRefundCluster ? 'Status' : isSubscriptionCluster ? 'Hinweis' : isBundleCluster ? 'Status' : 'Beleg'}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedTransactions.map((tx) => (
                          <TransactionRow
                            key={tx.id}
                            transaction={tx}
                            isActive={selectedTransactionId === tx.id}
                            onClick={() => setSelectedTransactionId(tx.id)}
                            formatCurrency={formatCurrency}
                            formatDate={formatDate}
                            priority={clusterMeta?.priority === 'high' ? 'high' : 'normal'}
                            isRefund={isRefundCluster}
                            isSubscription={isSubscriptionCluster}
                            isBundle={isBundleCluster}
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
        </DetailPageShell>
      </div>

    </div>
  );
}

// Simplified row component - no hover actions, only click to open inspector
interface TransactionRowProps {
  transaction: Transaction;
  isActive: boolean;
  onClick: () => void;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string) => string;
  priority?: 'high' | 'normal';
  isRefund?: boolean;
  isSubscription?: boolean;
  isBundle?: boolean;
}

function TransactionRow({
  transaction,
  isActive,
  onClick,
  formatCurrency,
  formatDate,
  priority = 'normal',
  isRefund = false,
  isSubscription = false,
  isBundle = false,
}: TransactionRowProps) {
  // Refund rows use green accent, subscription uses blue accent, bundle uses orange, others use priority-based styling
  const rowStyles = isRefund
    ? isActive
      ? 'bg-[hsl(var(--status-confident))]/10 border-l-[3px] border-l-[hsl(var(--status-confident))]'
      : 'hover:bg-[hsl(var(--status-confident))]/5 border-l-[3px] border-l-transparent hover:border-l-[hsl(var(--status-confident))]/40'
    : isSubscription
      ? isActive
        ? 'bg-blue-50 dark:bg-blue-950/30 border-l-[3px] border-l-blue-500'
        : 'hover:bg-blue-50/50 dark:hover:bg-blue-950/20 border-l-[3px] border-l-transparent hover:border-l-blue-400/40'
      : isBundle
        ? isActive
          ? 'bg-orange-50 dark:bg-orange-950/30 border-l-[3px] border-l-orange-500'
          : 'hover:bg-orange-50/50 dark:hover:bg-orange-950/20 border-l-[3px] border-l-transparent hover:border-l-orange-400/40'
        : priority === 'high'
          ? isActive
            ? 'bg-destructive/10 border-l-[3px] border-l-destructive'
            : 'bg-destructive/[0.03] hover:bg-destructive/[0.08] border-l-[3px] border-l-transparent hover:border-l-destructive/40'
          : isActive
            ? 'bg-primary/10 border-l-[3px] border-l-primary'
            : 'hover:bg-muted/50 border-l-[3px] border-l-transparent hover:border-l-primary/30';

  return (
    <TableRow
      className={`cursor-pointer transition-colors ${rowStyles}`}
      onClick={onClick}
    >
      <TableCell className="py-3 text-sm">{formatDate(transaction.date)}</TableCell>
      <TableCell className="py-3 font-medium">{transaction.merchant}</TableCell>
      <TableCell className="py-3 text-muted-foreground text-sm">
        <span className="line-clamp-1">{transaction.purpose || '–'}</span>
      </TableCell>
      <TableCell className={`py-3 text-right font-medium tabular-nums ${isRefund ? 'text-[hsl(var(--status-confident))]' : ''}`}>
        {isRefund && transaction.amount > 0 ? '+' : ''}{formatCurrency(transaction.amount)}
      </TableCell>
      <TableCell className="py-3">
        {isRefund ? (
          <Badge 
            variant="outline" 
            className="text-xs font-medium border-amber-500/30 text-amber-600 bg-amber-50"
          >
            zu prüfen
          </Badge>
        ) : isSubscription ? (
          <Badge 
            variant="outline" 
            className="text-xs font-medium border-blue-500/30 text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400"
          >
            mögl. regelmäßig
          </Badge>
        ) : isBundle ? (
          <Badge 
            variant="outline" 
            className="text-xs font-medium border-orange-500/30 text-orange-600 bg-orange-50 dark:bg-orange-950/50 dark:text-orange-400"
          >
            zuordnen
          </Badge>
        ) : (
          <Badge 
            variant={priority === 'high' ? 'destructive' : 'secondary'} 
            className="text-xs font-medium"
          >
            fehlt
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
