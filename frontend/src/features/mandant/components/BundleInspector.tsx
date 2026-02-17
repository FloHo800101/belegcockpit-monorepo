import { useState, useMemo } from 'react';
import { X, ArrowLeft, ArrowRight, Layers, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Transaction, Document } from '@/data/types';

interface CandidateDocument {
  id: string;
  supplierName: string;
  date: string;
  total: number;
}

interface BundleInspectorProps {
  transaction: Transaction;
  candidateDocuments: CandidateDocument[];
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onSaveAssignment: (selectedDocIds: string[]) => void;
  onHandover: (comment: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

type Mode = 'main' | 'other';

export function BundleInspector({
  transaction,
  candidateDocuments,
  openCount,
  totalCount,
  onClose,
  onSaveAssignment,
  onHandover,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: BundleInspectorProps) {
  const [mode, setMode] = useState<Mode>('main');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [handoverComment, setHandoverComment] = useState('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const resolvedCount = totalCount - openCount;
  const progress = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  // Calculate selected sum
  const selectedSum = useMemo(() => {
    return candidateDocuments
      .filter(doc => selectedDocIds.has(doc.id))
      .reduce((sum, doc) => sum + doc.total, 0);
  }, [candidateDocuments, selectedDocIds]);

  // Transaction amount (absolute value for comparison)
  const transactionAmount = Math.abs(transaction.amount);
  
  // Check if sum matches (with small tolerance for rounding)
  const sumMatches = Math.abs(selectedSum - transactionAmount) < 0.01;
  const hasSelection = selectedDocIds.size > 0;

  const toggleDocument = (docId: string) => {
    setSelectedDocIds(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const handleSaveAssignment = () => {
    if (sumMatches && hasSelection) {
      onSaveAssignment(Array.from(selectedDocIds));
      setSelectedDocIds(new Set());
    }
  };

  const handleHandoverSubmit = () => {
    if (handoverComment.trim()) {
      onHandover(handoverComment);
      setHandoverComment('');
      setMode('main');
    }
  };

  // Main view with document selection
  const renderMainView = () => (
    <>
      {/* Explanation */}
      <p className="text-sm text-muted-foreground">
        Diese Sammelzahlung muss einem oder mehreren Belegen zugeordnet werden. Die Summe der ausgewählten Belege muss dem Zahlungsbetrag entsprechen.
      </p>

      {/* Progress Callout */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
        <Layers className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-orange-900 dark:text-orange-100">
            Noch {openCount} von {totalCount} zuzuordnen
          </div>
          <div className="text-xs text-orange-700 dark:text-orange-300">
            {progress}% erledigt
          </div>
        </div>
      </div>

      {/* Transaction Details (read-only) */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
        <h4 className="font-medium text-sm">Transaktion</h4>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Datum</span>
          <span className="font-medium">{formatDate(transaction.date)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Betrag</span>
          <span className="font-medium">{formatCurrency(transaction.amount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Empfänger / Sender</span>
          <span className="font-medium text-right max-w-[60%] truncate">{transaction.merchant}</span>
        </div>
        {transaction.purpose && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Verwendungszweck</span>
            <span className="font-medium text-right max-w-[60%] truncate">{transaction.purpose}</span>
          </div>
        )}
      </div>

      {/* Candidate Documents */}
      <div className="space-y-2">
        <h4 className="font-medium text-sm">Kandidaten-Belege</h4>
        <ScrollArea className="h-[200px] border rounded-lg">
          <div className="p-2 space-y-2">
            {candidateDocuments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Keine Kandidaten-Belege verfügbar
              </p>
            ) : (
              candidateDocuments.map(doc => (
                <label
                  key={doc.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedDocIds.has(doc.id)
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted/50 border-transparent bg-muted/30'
                  }`}
                >
                  <Checkbox
                    checked={selectedDocIds.has(doc.id)}
                    onCheckedChange={() => toggleDocument(doc.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{doc.supplierName}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(doc.date)}</div>
                  </div>
                  <div className="font-medium text-sm tabular-nums">
                    {formatCurrency(doc.total)}
                  </div>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Live Sum Display with Traffic Light */}
      <div className={`flex items-center justify-between p-3 rounded-lg border ${
        !hasSelection
          ? 'bg-muted/30 border-muted'
          : sumMatches
            ? 'bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-700'
            : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700'
      }`}>
        <div className="flex items-center gap-2">
          {hasSelection && (
            sumMatches ? (
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            )
          )}
          <span className="text-sm font-medium">
            Ausgewählte Belege: {formatCurrency(selectedSum)}
          </span>
        </div>
        <div className="text-sm">
          {hasSelection && (
            sumMatches ? (
              <span className="text-green-600 dark:text-green-400 font-medium">✓ Summe stimmt</span>
            ) : (
              <span className="text-red-600 dark:text-red-400 font-medium">
                Differenz: {formatCurrency(Math.abs(selectedSum - transactionAmount))}
              </span>
            )
          )}
        </div>
      </div>

      {/* Primary Actions */}
      <div className="space-y-2">
        <Button 
          className="w-full" 
          onClick={handleSaveAssignment}
          disabled={!sumMatches || !hasSelection}
        >
          <Check className="mr-2 h-4 w-4" />
          Zuordnung speichern
        </Button>
      </div>

      {/* Secondary Actions */}
      <div className="pt-2 border-t space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setMode('other')}
        >
          Anders lösen…
        </Button>
      </div>
    </>
  );

  // Other / Handover view
  const renderOtherView = () => (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMode('main')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h4 className="font-medium">Anders lösen</h4>
      </div>

      <p className="text-sm text-muted-foreground">
        Wenn die Zuordnung nicht möglich ist, kannst du diesen Fall an die Kanzlei übergeben.
      </p>

      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Transaktion</span>
          <span className="font-medium">{transaction.merchant}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Betrag</span>
          <span className="font-medium">{formatCurrency(transaction.amount)}</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Kommentar (Pflichtfeld)</label>
        <Textarea
          placeholder="Warum kann die Zuordnung nicht erfolgen?..."
          value={handoverComment}
          onChange={(e) => setHandoverComment(e.target.value)}
          rows={3}
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setMode('main')}>
          Abbrechen
        </Button>
        <Button
          className="flex-1"
          onClick={handleHandoverSubmit}
          disabled={!handoverComment.trim()}
        >
          An Kanzlei übergeben
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Sammelzahlung zuordnen</h3>
          <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600 bg-orange-50">
            zuordnen
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {mode === 'main' && renderMainView()}
        {mode === 'other' && renderOtherView()}
      </div>

      {/* Footer Navigation - always visible */}
      <div className="border-t bg-background flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="p-4 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="default"
            disabled={!hasPrevious}
            onClick={onPrevious}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Vorherige Zahlung
          </Button>
          <Button
            variant="outline"
            disabled={!hasNext}
            onClick={onNext}
            className="flex-1 max-w-[220px] border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 font-medium"
          >
            Nächste Zahlung klären
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Cluster complete component
export function BundleClusterComplete({
  totalResolved,
  onContinue,
}: {
  totalResolved: number;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
        <Layers className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Alle Sammelzahlungen zugeordnet!</h3>
      <p className="text-muted-foreground mb-6">
        Du hast {totalResolved} Sammelzahlungen erfolgreich zugeordnet.
      </p>
      <Button onClick={onContinue}>
        Zurück zur Übersicht
      </Button>
    </div>
  );
}
