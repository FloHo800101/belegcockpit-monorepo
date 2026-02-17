import { useState, useRef, useCallback } from 'react';
import { X, CheckCircle2, ArrowRight, ArrowLeft, Coins, Upload, FileText, Banknote, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Transaction } from '@/data/types';

interface SelectedFile {
  file: File;
  id: string;
}

interface SmallAmountInspectorProps {
  transaction: Transaction;
  openCount: number;
  totalCount: number;
  onClose: () => void;
  onEigenbeleg: () => void;
  onCashPayment: () => void;
  onUpload: (files?: File[]) => void;
  onNoReceipt: (comment: string) => void;
  onHandover: (comment: string) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

// Cluster complete state component
interface SmallAmountClusterCompleteProps {
  totalResolved: number;
  onContinue: () => void;
}

export function SmallAmountClusterComplete({ totalResolved, onContinue }: SmallAmountClusterCompleteProps) {
  return (
    <div className="bg-background flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-[hsl(var(--status-confident))]" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Alle Kleinbeträge geklärt</h2>
        <p className="text-muted-foreground mb-1">
          {totalResolved} Kleinbeträge wurden bearbeitet.
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

export function SmallAmountInspector({
  transaction,
  openCount,
  totalCount,
  onClose,
  onEigenbeleg,
  onCashPayment,
  onUpload,
  onNoReceipt,
  onHandover,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
}: SmallAmountInspectorProps) {
  const [mode, setMode] = useState<'main' | 'no_receipt' | 'handover'>('main');
  const [comment, setComment] = useState('');
  const [showUploadCard, setShowUploadCard] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Math.abs(amount));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // File handling
  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const newFiles: SelectedFile[] = Array.from(files).map(file => ({
      file,
      id: `${file.name}-${Date.now()}-${Math.random()}`
    }));
    setSelectedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const removeFile = (id: string) => {
    setSelectedFiles(prev => prev.filter(f => f.id !== id));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    
    // Simulate upload delay (mock)
    await new Promise(resolve => setTimeout(resolve, 800));
    
    onUpload(selectedFiles.map(f => f.file));
    
    // Reset state
    setIsUploading(false);
    setShowUploadCard(false);
    setSelectedFiles([]);
  };

  const handleUploadCancel = () => {
    setShowUploadCard(false);
    setSelectedFiles([]);
  };

  const handleNoReceiptSubmit = () => {
    if (!comment.trim()) return;
    onNoReceipt(comment);
    setMode('main');
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
    setComment('');
  };

  // No receipt form
  if (mode === 'no_receipt') {
    return (
      <div className="bg-background flex flex-col h-full">
        {/* Header */}
        <div className="p-5 border-b space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between">
            <span className="font-semibold text-base">Kein Beleg vorhanden</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Bitte kurz erläutern, warum kein Beleg vorliegt.
          </p>
        </div>

        {/* Transaction Summary */}
        <div className="px-5 py-4 border-b bg-muted/20 flex-shrink-0">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">{transaction.merchant}</span>
            <span className="font-medium">{formatCurrency(transaction.amount)}</span>
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
            placeholder='z.B. "Automat ohne Belegausgabe", "Beleg verloren"...'
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1 min-h-[100px] resize-none"
            autoFocus
          />
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-end gap-3 bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={handleCancel}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleNoReceiptSubmit}
            disabled={!comment.trim()}
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
            <span className="font-medium">{formatCurrency(transaction.amount)}</span>
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
            placeholder='z.B. "Nicht zuordenbar", "Benötige Rücksprache"...'
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
            <Coins className="h-5 w-5 text-muted-foreground" />
            <span className="font-semibold text-base">Kleinbetrag</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Badge variant="secondary" className="text-xs font-medium">
          Offen (Mandant)
        </Badge>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Für diesen Kleinbetrag fehlt ein Beleg. Wähle die passende Option.
        </p>
      </div>

      {/* Progress Callout */}
      <div className="mx-5 my-4 flex-shrink-0">
        <div className="relative rounded-lg p-4 pl-5 overflow-hidden bg-muted/50 border">
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg bg-muted-foreground/30"/>
          <div className="flex items-start gap-3">
            <Coins className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">
                Noch {openCount} von {totalCount} Kleinbeträge offen
              </p>
              <p className="text-xs text-muted-foreground">
                Jeder geklärte Posten bringt dich näher zum Monatsabschluss.
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
              <span className="text-lg font-semibold">{formatCurrency(transaction.amount)}</span>
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

        {/* Primary Action - Upload with inline card */}
        <div className="space-y-3">
          {!showUploadCard ? (
            <>
              <Button 
                className="w-full h-12 text-base font-medium" 
                size="lg"
                onClick={() => setShowUploadCard(true)}
              >
                <Upload className="mr-2 h-5 w-5" />
                Beleg hochladen
              </Button>
              
              {/* Secondary Actions */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={onEigenbeleg}
              >
                <FileText className="mr-2 h-4 w-4" />
                Eigenbeleg erstellen
              </Button>
              
              <Button 
                variant="outline"
                className="w-full" 
                onClick={onCashPayment}
              >
                <Banknote className="mr-2 h-4 w-4" />
                Als Barzahlung bestätigen
              </Button>
            </>
          ) : (
            /* Inline Upload Card */
            <div className="border rounded-lg bg-muted/30 overflow-hidden">
              {/* Dropzone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  p-6 border-2 border-dashed rounded-t-lg transition-colors cursor-pointer
                  ${isDragOver 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted-foreground/25 hover:border-muted-foreground/40'
                  }
                `}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <div className="flex flex-col items-center gap-2 text-center">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Upload className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Datei hierher ziehen oder <span className="text-primary underline">auswählen</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      PDF, JPG, PNG – max. 10 MB
                    </p>
                  </div>
                </div>
              </div>

              {/* Selected files list */}
              {selectedFiles.length > 0 && (
                <div className="border-t px-4 py-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {selectedFiles.length} Datei{selectedFiles.length > 1 ? 'en' : ''} ausgewählt
                  </p>
                  <div className="space-y-1.5 max-h-32 overflow-auto">
                    {selectedFiles.map((sf) => (
                      <div 
                        key={sf.id} 
                        className="flex items-center justify-between gap-2 text-sm bg-background rounded px-2 py-1.5"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{sf.file.name}</span>
                          <span className="text-xs text-muted-foreground flex-shrink-0">
                            ({formatFileSize(sf.file.size)})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFile(sf.id)}
                          disabled={isUploading}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="border-t px-4 py-3 flex items-center justify-end gap-2 bg-muted/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleUploadCancel}
                  disabled={isUploading}
                >
                  Abbrechen
                </Button>
                <Button 
                  size="sm"
                  onClick={handleUploadSubmit}
                  disabled={selectedFiles.length === 0 || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird hochgeladen…
                    </>
                  ) : (
                    'Upload speichern'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Tertiary Actions */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Weitere Optionen</p>
          <div className="space-y-1">
            <Button
              variant="link"
              className="w-full justify-start px-0 h-auto py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMode('no_receipt')}
            >
              Kein Beleg vorhanden
            </Button>
            <Button
              variant="link"
              className="w-full justify-start px-0 h-auto py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setMode('handover')}
            >
              An Kanzlei übergeben
            </Button>
          </div>
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
