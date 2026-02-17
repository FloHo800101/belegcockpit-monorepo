import { useState } from 'react';
import { X, ArrowLeft, ArrowRight, AlertTriangle, Calendar, Repeat, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Transaction } from '@/data/types';

interface SubscriptionInspectorProps {
  transaction: Transaction;
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onConfirmSubscription: (interval: string, startDate: string, note: string) => void;
  onNoSubscription: () => void;
  onHandover: (comment: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  hasNext: boolean;
  hasPrevious: boolean;
}

type Mode = 'main' | 'subscription_form' | 'handover';

export function SubscriptionInspector({
  transaction,
  openCount,
  totalCount,
  onClose,
  onConfirmSubscription,
  onNoSubscription,
  onHandover,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
}: SubscriptionInspectorProps) {
  const [mode, setMode] = useState<Mode>('main');
  const [handoverComment, setHandoverComment] = useState('');
  
  // Subscription form state
  const [interval, setInterval] = useState('monatlich');
  const [startDate, setStartDate] = useState(transaction.date);
  const [note, setNote] = useState('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const resolvedCount = totalCount - openCount;
  const progress = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

  const handleConfirmSubscription = () => {
    onConfirmSubscription(interval, startDate, note);
    // Reset form
    setMode('main');
    setInterval('monatlich');
    setNote('');
  };

  const handleHandoverSubmit = () => {
    if (handoverComment.trim()) {
      onHandover(handoverComment);
      setHandoverComment('');
      setMode('main');
    }
  };

  // Main view with actions
  const renderMainView = () => (
    <>
      {/* Warum markiert - Explanation at top */}
      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-amber-900 dark:text-amber-100">Warum markiert?</div>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              Diese Zahlung wirkt wie ein Abo/Vertrag – regelmäßiger Betrag, gleicher Empfänger.
            </p>
          </div>
        </div>
      </div>

      {/* Transaction Details (read-only) */}
      <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
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

      {/* Primary Actions */}
      <div className="space-y-2">
        <Button className="w-full" onClick={() => setMode('subscription_form')}>
          <Repeat className="mr-2 h-4 w-4" />
          Als Abo/Vertrag bestätigen
        </Button>
        <Button variant="outline" className="w-full" onClick={onNoSubscription}>
          Kein Abo
        </Button>
      </div>

      {/* Secondary Actions */}
      <div className="pt-2 border-t space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setMode('handover')}
        >
          An Kanzlei übergeben
        </Button>
      </div>
    </>
  );

  // Subscription form view
  const renderSubscriptionForm = () => (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMode('main')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h4 className="font-medium">Abo/Vertrag einrichten</h4>
      </div>

      <p className="text-sm text-muted-foreground">
        Diese Zahlung wird als wiederkehrend markiert.
      </p>

      {/* Form Fields */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="interval">Intervall</Label>
          <Select value={interval} onValueChange={setInterval}>
            <SelectTrigger id="interval">
              <SelectValue placeholder="Intervall wählen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monatlich">Monatlich</SelectItem>
              <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
              <SelectItem value="jährlich">Jährlich</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Startdatum</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="note">Notiz (optional)</Label>
          <Textarea
            id="note"
            placeholder="z. B. Vertragsnummer, Anmerkungen..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Transaction summary */}
      <div className="p-3 bg-muted/30 rounded-lg text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Händler</span>
          <span className="font-medium">{transaction.merchant}</span>
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-muted-foreground">Betrag</span>
          <span className="font-medium">{formatCurrency(transaction.amount)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setMode('main')}>
          Abbrechen
        </Button>
        <Button className="flex-1" onClick={handleConfirmSubscription}>
          Speichern
        </Button>
      </div>
    </>
  );

  // Handover view
  const renderHandoverView = () => (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setMode('main')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h4 className="font-medium">An Kanzlei übergeben</h4>
      </div>

      <p className="text-sm text-muted-foreground">
        Bitte gib einen Kommentar an, warum diese Zahlung an die Kanzlei übergeben wird.
      </p>

      <Textarea
        placeholder="Kommentar (Pflichtfeld)..."
        value={handoverComment}
        onChange={(e) => setHandoverComment(e.target.value)}
        rows={3}
        autoFocus
      />

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => setMode('main')}>
          Abbrechen
        </Button>
        <Button
          className="flex-1"
          onClick={handleHandoverSubmit}
          disabled={!handoverComment.trim()}
        >
          Übergeben
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Mögliches Abo/Vertrag</h3>
          <Badge variant="secondary" className="text-xs">
            möglicherweise regelmäßig
          </Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {mode === 'main' && renderMainView()}
        {mode === 'subscription_form' && renderSubscriptionForm()}
        {mode === 'handover' && renderHandoverView()}
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
export function SubscriptionClusterComplete({
  totalResolved,
  onContinue,
}: {
  totalResolved: number;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
        <Repeat className="h-8 w-8 text-green-600 dark:text-green-400" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Alle Abos geprüft!</h3>
      <p className="text-muted-foreground mb-6">
        Du hast {totalResolved} mögliche Abos/Verträge erfolgreich geprüft.
      </p>
      <Button onClick={onContinue}>
        Zurück zur Übersicht
      </Button>
    </div>
  );
}
