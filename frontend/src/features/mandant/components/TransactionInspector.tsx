import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, ChevronLeft, ChevronRight, CheckCircle2, ArrowRight, AlertTriangle, Trash2, Loader2, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Transaction, Document } from '@/data/types';
import { ReceiptViewerSheet } from './ReceiptViewerSheet';

interface SelectedFile {
  file: File;
  id: string;
}

interface TransactionInspectorProps {
  transaction: Transaction;
  clusterTitle: string;
  clusterDescription: string;
  openCount: number;
  totalCount: number;
  priority?: 'high' | 'normal';
  onClose: () => void;
  onUpload: (files: File[]) => void;
  onEigenbeleg: () => void;
  onNoReceipt: (comment: string) => void;
  onHandover: (comment: string) => void;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
  linkedDocument?: Document | null;
}

// Cluster complete state component
interface ClusterCompleteProps {
  clusterTitle: string;
  totalResolved: number;
  onContinue: () => void;
}

function ClusterComplete({ clusterTitle, totalResolved, onContinue }: ClusterCompleteProps) {
  return (
    <div className="bg-background flex flex-col h-full">
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-[hsl(var(--status-confident))]/10 flex items-center justify-center mb-6">
          <CheckCircle2 className="h-8 w-8 text-[hsl(var(--status-confident))]" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Cluster erledigt</h2>
        <p className="text-muted-foreground mb-1">
          Alle {totalResolved} Zahlungen in "{clusterTitle}" wurden geklärt.
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

export function TransactionInspector({
  transaction,
  clusterTitle,
  clusterDescription,
  openCount,
  totalCount,
  priority = 'high',
  onClose,
  onUpload,
  onEigenbeleg,
  onNoReceipt,
  onHandover,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false,
  linkedDocument = null,
}: TransactionInspectorProps) {
  // UI state
  const [commentMode, setCommentMode] = useState<'no_receipt' | 'handover' | null>(null);
  const [comment, setComment] = useState('');
  const [showUploadCard, setShowUploadCard] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isReceiptSheetOpen, setIsReceiptSheetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if transaction has a linked document
  const hasLinkedDocument = linkedDocument !== null;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

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

  const handleCommentSubmit = () => {
    if (!comment.trim()) return;
    
    if (commentMode === 'no_receipt') {
      onNoReceipt(comment);
    } else if (commentMode === 'handover') {
      onHandover(comment);
    }
    
    // Reset state
    setCommentMode(null);
    setComment('');
  };

  const handleCommentCancel = () => {
    setCommentMode(null);
    setComment('');
  };

  // If in comment mode, show inline comment form
  if (commentMode) {
    const isNoReceipt = commentMode === 'no_receipt';
    return (
      <div className="bg-background flex flex-col h-full">
        {/* Header */}
        <div className="p-5 border-b space-y-3 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-destructive flex-shrink-0" />
              <span className="font-semibold text-base">
                {isNoReceipt ? 'Kein Beleg vorhanden' : 'An Kanzlei übergeben'}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={handleCommentCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isNoReceipt 
              ? 'Bitte erklären Sie, warum kein Beleg vorliegt.'
              : 'Bitte beschreiben Sie, was die Kanzlei wissen sollte.'}
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
            placeholder={isNoReceipt 
              ? 'z.B. "Barzahlung ohne Quittung", "Beleg verloren gegangen"...'
              : 'z.B. "Unklare Zuordnung", "Benötige Rücksprache"...'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="flex-1 min-h-[120px] resize-none"
            autoFocus
          />
          <p className="text-xs text-muted-foreground mt-2">
            {isNoReceipt
              ? 'Diese Notiz wird gespeichert und ist für die Kanzlei sichtbar.'
              : 'Die Kanzlei wird benachrichtigt und kann sich die Zahlung ansehen.'}
          </p>
        </div>

        {/* Sticky Footer Actions */}
        <div className="border-t p-4 flex items-center justify-end gap-3 bg-muted/30 flex-shrink-0">
          <Button variant="outline" onClick={handleCommentCancel}>
            Abbrechen
          </Button>
          <Button 
            onClick={handleCommentSubmit}
            disabled={!comment.trim()}
          >
            {isNoReceipt ? 'Bestätigen' : 'Übergeben'}
          </Button>
        </div>
      </div>
    );
  }

  // Normal transaction view
  return (
    <div className="bg-background flex flex-col h-full">
      {/* Header - fixed at top */}
      <div className="p-5 border-b space-y-3 flex-shrink-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-destructive flex-shrink-0" />
            <span className="font-semibold text-base">{clusterTitle}</span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 -mr-2 -mt-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Badge variant="secondary" className="text-xs font-medium">
          Offen (Mandant)
        </Badge>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {clusterDescription}
        </p>
      </div>


      {/* Transaction Details - scrollable content area */}
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
              <span className="text-lg font-semibold text-foreground">{formatCurrency(transaction.amount)}</span>
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

        {/* Primary Action - different based on whether document is linked */}
        <div className="space-y-3">
          {hasLinkedDocument ? (
            /* If document is already linked, show "View Receipt" button */
            <>
              <Button 
                className="w-full h-12 text-base font-medium" 
                size="lg"
                variant="outline"
                onClick={() => setIsReceiptSheetOpen(true)}
              >
                <Eye className="mr-2 h-5 w-5" />
                Beleg ansehen
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Dieser Transaktion ist bereits ein Beleg zugeordnet.
              </p>
            </>
          ) : !showUploadCard ? (
            <>
              <Button 
                className="w-full h-12 text-base font-medium" 
                size="lg"
                onClick={() => setShowUploadCard(true)}
              >
                <Upload className="mr-2 h-5 w-5" />
                Beleg hochladen
              </Button>
              
              {/* Secondary Action */}
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={onEigenbeleg}
              >
                <FileText className="mr-2 h-4 w-4" />
                Eigenbeleg erstellen
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

        {/* Tertiary Actions - Clearly marked as exceptions */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Weitere Optionen</p>
          <div className="space-y-1">
            <Button
              variant="link"
              className="w-full justify-start px-0 h-auto py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setCommentMode('no_receipt')}
            >
              Kein Beleg vorhanden
            </Button>
            <Button
              variant="link"
              className="w-full justify-start px-0 h-auto py-2 text-muted-foreground hover:text-foreground"
              onClick={() => setCommentMode('handover')}
            >
              An Kanzlei übergeben
            </Button>
          </div>
          <p className="text-xs text-muted-foreground/70 italic pt-1">
            Nur wählen, wenn kein Beleg beschafft werden kann.
          </p>
        </div>
      </div>

      {/* Sticky Navigation Footer - always visible at bottom */}
      <div className="border-t bg-background flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="p-4 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="default"
            disabled={!hasPrevious}
            onClick={onPrevious}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            <ChevronLeft className="mr-1.5 h-4 w-4" />
            Vorherige Zahlung
          </Button>
          <Button
            variant="outline"
            disabled={!hasNext}
            onClick={onNext}
            className="flex-1 max-w-[220px] border-primary/30 text-primary hover:bg-primary/5 hover:border-primary/50 font-medium"
          >
            Nächste Zahlung klären
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Receipt Viewer Sheet */}
      <ReceiptViewerSheet
        open={isReceiptSheetOpen}
        onOpenChange={setIsReceiptSheetOpen}
        document={linkedDocument}
        transaction={transaction}
      />
    </div>
  );
}

// Export the ClusterComplete component for use in ClusterDetail
export { ClusterComplete };
