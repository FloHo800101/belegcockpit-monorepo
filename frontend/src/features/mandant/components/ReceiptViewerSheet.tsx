import { FileText, Download, Calendar, Building2, Receipt, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Transaction, Document } from '@/data/types';

interface ReceiptViewerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  transaction: Transaction;
}

export function ReceiptViewerSheet({
  open,
  onOpenChange,
  document,
  transaction,
}: ReceiptViewerSheetProps) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  if (!document) {
    return null;
  }

  // Calculate match quality
  const amountDiff = Math.abs(transaction.amount - document.total);
  const amountMatch = amountDiff < 0.01;
  const merchantMatch = transaction.merchant.toLowerCase().includes(document.supplierName.toLowerCase()) ||
    document.supplierName.toLowerCase().includes(transaction.merchant.toLowerCase());

  // Generate a mock filename from supplier name
  const fileName = `${document.supplierName.replace(/\s+/g, '_')}_${document.date}.pdf`;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[500px] sm:max-w-[500px] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="p-5 pb-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Receipt className="h-4 w-4 text-primary" />
            </div>
            <div>
              <SheetTitle className="text-base">Beleg-Vorschau</SheetTitle>
              <SheetDescription className="text-xs">
                Zugeordnet am {formatDate(document.date)}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Content - scrollable */}
        <div className="flex-1 overflow-auto">
          {/* Document Preview Area */}
          <div className="p-5 bg-muted/30">
            <div className="aspect-[3/4] bg-white rounded-lg border-2 border-dashed border-muted-foreground/20 flex flex-col items-center justify-center relative overflow-hidden">
              {/* Mock document preview */}
              <div className="absolute inset-4 flex flex-col">
                {/* Fake document header */}
                <div className="bg-muted/50 rounded-t-md p-3 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium text-sm truncate">{fileName}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      PDF
                    </Badge>
                  </div>
                </div>
                
                {/* Fake document content */}
                <div className="flex-1 bg-background p-4 rounded-b-md space-y-4">
                  {/* Logo placeholder */}
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{document.supplierName}</p>
                      <p className="text-xs text-muted-foreground">Rechnung / Beleg</p>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  {/* Fake line items */}
                  <div className="space-y-2">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-4/5" />
                  </div>
                  
                  {/* Total */}
                  <div className="mt-auto pt-4 border-t">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Gesamt</span>
                      <span className="font-bold text-lg">{formatCurrency(document.total)}</span>
                    </div>
                    {document.vat > 0 && (
                      <div className="flex justify-between items-center text-xs text-muted-foreground mt-1">
                        <span>inkl. MwSt.</span>
                        <span>{formatCurrency(document.vat)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Overlay hint */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-3 py-1.5 rounded-full shadow-sm border">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <ExternalLink className="h-3 w-3" />
                  Vorschau (Original nicht verfügbar)
                </p>
              </div>
            </div>
          </div>

          {/* Document Details */}
          <div className="p-5 space-y-5">
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Beleg-Details
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Belegdatum
                  </span>
                  <span className="text-sm font-medium">{formatDate(document.date)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Lieferant
                  </span>
                  <span className="text-sm font-medium">{document.supplierName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Belegbetrag
                  </span>
                  <span className="text-sm font-semibold">{formatCurrency(document.total)}</span>
                </div>
                {document.vat > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground pl-6">
                      davon MwSt.
                    </span>
                    <span className="text-sm">{formatCurrency(document.vat)}</span>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Comparison with Transaction */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Abgleich mit Transaktion
              </h4>
              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Transaktionsbetrag</span>
                  <span className="text-sm font-medium">{formatCurrency(transaction.amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Belegbetrag</span>
                  <span className="text-sm font-medium">{formatCurrency(document.total)}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Differenz</span>
                  <span className={`text-sm font-medium ${amountMatch ? 'text-[hsl(var(--status-confident))]' : 'text-destructive'}`}>
                    {amountMatch ? '✓ Exakt' : formatCurrency(amountDiff)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Lieferant-Match</span>
                  <span className={`text-sm font-medium ${merchantMatch ? 'text-[hsl(var(--status-confident))]' : 'text-amber-600'}`}>
                    {merchantMatch ? '✓ Übereinstimmung' : '⚠ Abweichend'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 flex items-center justify-between bg-muted/30 flex-shrink-0">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Original herunterladen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
