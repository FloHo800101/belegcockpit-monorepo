import { useState } from 'react';
import { X, CheckCircle2, ArrowRight, ArrowLeft, HelpCircle, CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Transaction } from '@/data/types';

interface RefundInspectorProps {
  transaction: Transaction;
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onConfirmRefund: () => void;
  onOtherReason: (reason: string, comment: string) => void;
  onHandover: (comment: string) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

// Cluster complete state component
interface RefundClusterCompleteProps {
  totalResolved: number;
  onContinue: () => void;
}

export function RefundClusterComplete({ totalResolved, onContinue }: RefundClusterCompleteProps) {
  return (
    <div className="bg-background flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-[hsl(var(--status-confident))]" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Alle Erstattungen geprüft</h2>
        <p className="text-muted-foreground mb-1">
          {totalResolved} Erstattungen wurden bestätigt.
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Du kannst jetzt mit dem nächsten Cluster fortfahren.
        </p>
        <Button onClick={onContinue} size="lg">
          Weiter zum nächsten Cluster
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

const OTHER_REASONS = [
  { value: 'korrektur', label: 'Korrektur' },
  { value: 'umbuchung', label: 'Umbuchung' },
  { value: 'privat', label: 'Privat' },
  { value: 'unklar', label: 'Unklar' },
];

export function RefundInspector({
  transaction,
  openCount,
  totalCount,
  onClose,
  onConfirmRefund,
  onOtherReason,
  onHandover,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: RefundInspectorProps) {
  const [mode, setMode] = useState<'main' | 'other_reason' | 'handover'>('main');
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [comment, setComment] = useState('');

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const handleOtherReasonSubmit = () => {
    if (!selectedReason || !comment.trim()) return;
    onOtherReason(selectedReason, comment);
    setMode('main');
    setSelectedReason('');
    setComment('');
  };

  const handleHandoverSubmit = () => {
    if (!comment.trim()) return;
    onHandover(comment);
    setMode('main');
    setComment('');
  };

  const handleCancel = () => {
    setMode('main');
    setSelectedReason('');
    setComment('');
  };

  // Other reason form
  if (mode === 'other_reason') {
    return (
      <div className="bg-background flex flex-col h-full">
        {/* Header */}
        <div className="p-5 border-b space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold text-base">Anderer Grund</span>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Bitte wähle den passenden Grund und füge einen Kommentar hinzu.
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="px-5 py-4 border-b bg-muted/20 flex-shrink-0">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{transaction.merchant}</span>
            <span className="font-medium text-[hsl(var(--status-confident))]">
              +{formatCurrency(transaction.amount)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDate(transaction.date)}
          </div>
        </div>

        {/* Form */}
        <div className="p-5 flex-1 flex flex-col overflow-auto space-y-4">
          <div className="space-y-3">
            <label className="text-sm font-medium">
              Grund auswählen <span className="text-destructive">*</span>
            </label>
            <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
              {OTHER_REASONS.map((reason) => (
                <div key={reason.value} className="flex items-center space-x-3">
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label htmlFor={reason.value} className="cursor-pointer">
                    {reason.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Kommentar <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder='z.B. "Interne Umbuchung zwischen Konten", "Korrigierte Rechnung"...'
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="min-h-[100px] resize-none"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-end gap-3 bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleOtherReasonSubmit}
            disabled={!selectedReason || !comment.trim()}
          >
            Bestätigen
          </Button>
        </div>
      </div>
    );
  }

  // Handover form
  if (mode === 'handover') {
    return (
      <div className="bg-background flex flex-col h-full">
        {/* Header */}
        <div className="p-5 border-b space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between">
            <span className="font-semibold text-base">An Kanzlei übergeben</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Bitte beschreiben Sie, was die Kanzlei wissen sollte.
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="px-5 py-4 border-b bg-muted/20 flex-shrink-0">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{transaction.merchant}</span>
            <span className="font-medium text-[hsl(var(--status-confident))]">
              +{formatCurrency(transaction.amount)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {formatDate(transaction.date)}
          </div>
        </div>

        {/* Comment Form */}
        <div className="p-5 flex-1 flex flex-col overflow-auto">
          <label className="text-sm font-medium mb-2">
            Kommentar <span className="text-destructive">*</span>
          </label>
          <Textarea
            placeholder='z.B. "Unklare Zuordnung", "Benötige Rücksprache"...'
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1 min-h-[120px] resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2">
            Die Kanzlei wird benachrichtigt und kann sich die Zahlung ansehen.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-end gap-3 bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleHandoverSubmit}
            disabled={!comment.trim()}
          >
            Übergeben
          </Button>
        </div>
      </div>
    );
  }

  // Main view
  return (
    <div className="bg-background flex flex-col h-full">
      {/* Header - fixed at top */}
      <div className="p-5 border-b space-y-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[hsl(var(--status-confident))]" />
            <span className="font-semibold text-base">Erstattung / Gutschrift</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Badge variant="secondary" className="text-xs font-medium">
          Offen (Mandant)
        </Badge>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Diese Zahlung ist vermutlich eine Erstattung/Gutschrift.
        </p>
      </div>

      {/* Progress Callout */}
      <div className="mx-5 my-4 flex-shrink-0">
        <div className="relative rounded-lg p-4 pl-5 overflow-hidden bg-[hsl(var(--status-confident))]/5 border border-[hsl(var(--status-confident))]/20">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-[hsl(var(--status-confident))]"/>
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-[hsl(var(--status-confident))] flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">
                Noch {openCount} von {totalCount} zu prüfen
              </p>
              <p className="text-xs text-muted-foreground">
                Bestätige kurz, worum es sich handelt.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Details - scrollable */}
      <div className="p-5 space-y-5 flex-1 overflow-auto min-h-0">
        <div>
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-4">Transaktionsdetails</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Datum</span>
              <span className="text-sm font-medium">{formatDate(transaction.date)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Betrag</span>
              <span className="text-lg font-semibold text-[hsl(var(--status-confident))]">
                +{formatCurrency(transaction.amount)}
              </span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Empfänger / Sender</span>
              <span className="text-sm font-medium text-right max-w-[200px]">{transaction.merchant}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-sm text-muted-foreground">Verwendungszweck</span>
              <span className="text-sm text-right max-w-[200px] text-muted-foreground">
                {transaction.purpose || '–'}
              </span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Primary Actions */}
        <div className="space-y-3">
          <Button 
            className="w-full h-12 text-base font-medium bg-[hsl(var(--status-confident))] hover:bg-[hsl(var(--status-confident))]/90" 
            size="lg"
            onClick={onConfirmRefund}
          >
            <CheckCircle2 className="mr-2 h-5 w-5" />
            Als Erstattung bestätigen
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full" 
            onClick={() => setMode('other_reason')}
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            Anderer Grund…
          </Button>
        </div>

        <Separator />

        {/* Secondary Action */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Weitere Optionen</p>
          <Button
            variant="link"
            className="w-full justify-start px-0 h-auto py-2 text-muted-foreground hover:text-foreground"
            onClick={() => setMode('handover')}
          >
            An Kanzlei übergeben
          </Button>
        </div>
      </div>

      {/* Footer Navigation - sticky at bottom */}
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
