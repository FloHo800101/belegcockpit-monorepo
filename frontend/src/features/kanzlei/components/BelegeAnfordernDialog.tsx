import { useState, useMemo } from 'react';
import { Mail, MessageSquare, Send, Check, Filter } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Types
interface MissingItem {
  datum: string;
  betrag: number;
  gegenpartei: string;
  verwendungszweck?: string;
}

interface Mandant {
  id: string;
  clientName: string;
  monthLabel: string;
  status: string;
  openAmountTotal: number;
  missingCount: number;
  unsureCount: number;
}

interface BelegeAnfordernDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mandanten: Mandant[];
  materialityThreshold?: number;
  onSendComplete?: (mandantIds: string[]) => void;
}

// Mock missing items per mandant (in real app, this would come from API)
const getMissingItemsForMandant = (mandantId: string): MissingItem[] => {
  const mockItems: Record<string, MissingItem[]> = {
    'mueller-gmbh': [
      { datum: '15.11.2025', betrag: 180, gegenpartei: 'Amazon Business', verwendungszweck: 'Büromaterial' },
      { datum: '18.11.2025', betrag: 95, gegenpartei: 'Media Markt', verwendungszweck: 'IT-Zubehör' },
      { datum: '22.11.2025', betrag: 145, gegenpartei: 'Staples', verwendungszweck: 'Druckerpapier' },
    ],
    'bäckerei-schmidt': [
      { datum: '05.11.2025', betrag: 320, gegenpartei: 'Metro Cash & Carry', verwendungszweck: 'Lebensmittel' },
      { datum: '12.11.2025', betrag: 85, gegenpartei: 'Hygiene-Shop GmbH' },
      { datum: '19.11.2025', betrag: 245, gegenpartei: 'Backzutaten Online' },
      { datum: '25.11.2025', betrag: 160, gegenpartei: 'Elektro Müller', verwendungszweck: 'Reparatur' },
      { datum: '28.11.2025', betrag: 80, gegenpartei: 'Verpackungswelt' },
    ],
    'cafe-central': [
      { datum: '08.10.2025', betrag: 120, gegenpartei: 'Getränke Hoffmann' },
      { datum: '21.10.2025', betrag: 60, gegenpartei: 'Reinigungsbedarf 24' },
    ],
    'blumen-paradies': [
      { datum: '03.11.2025', betrag: 280, gegenpartei: 'Blumengroßhandel Nord' },
      { datum: '10.11.2025', betrag: 95, gegenpartei: 'Töpferei Keramik', verwendungszweck: 'Übertöpfe' },
      { datum: '17.11.2025', betrag: 85, gegenpartei: 'Gartenbedarf Online' },
      { datum: '24.11.2025', betrag: 60, gegenpartei: 'Floristik-Zubehör' },
    ],
  };
  
  // Generate random items for unknown mandants
  if (!mockItems[mandantId]) {
    return [
      { datum: '10.11.2025', betrag: Math.floor(Math.random() * 200) + 50, gegenpartei: 'Unbekannter Lieferant' },
      { datum: '20.11.2025', betrag: Math.floor(Math.random() * 150) + 30, gegenpartei: 'Diverse Ausgaben' },
    ];
  }
  
  return mockItems[mandantId];
};

export function BelegeAnfordernDialog({
  open,
  onOpenChange,
  mandanten,
  materialityThreshold = 40,
  onSendComplete,
}: BelegeAnfordernDialogProps) {
  const [channel, setChannel] = useState<'email' | 'internal'>('email');
  const [onlyAboveThreshold, setOnlyAboveThreshold] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Get all missing items for all mandanten
  const mandantenWithItems = useMemo(() => {
    return mandanten
      .filter(m => m.missingCount > 0 || m.status === 'OVERDUE')
      .map(m => {
        const items = getMissingItemsForMandant(m.id);
        const filteredItems = onlyAboveThreshold 
          ? items.filter(item => item.betrag >= materialityThreshold)
          : items;
        return {
          ...m,
          missingItems: filteredItems,
          totalBetrag: filteredItems.reduce((sum, item) => sum + item.betrag, 0),
        };
      })
      .filter(m => m.missingItems.length > 0);
  }, [mandanten, onlyAboveThreshold, materialityThreshold]);

  const totalItems = mandantenWithItems.reduce((sum, m) => sum + m.missingItems.length, 0);
  const totalBetrag = mandantenWithItems.reduce((sum, m) => sum + m.totalBetrag, 0);

  // Generate email text
  const generateEmailText = (mandant: typeof mandantenWithItems[0]) => {
    const itemsList = mandant.missingItems
      .map(item => `• ${item.datum} | ${item.betrag.toFixed(2)}€ | ${item.gegenpartei}${item.verwendungszweck ? ` (${item.verwendungszweck})` : ''}`)
      .join('\n');

    return `Sehr geehrte Damen und Herren,

für den Abrechnungszeitraum ${mandant.monthLabel} fehlen uns noch folgende Belege:

${itemsList}

Gesamtbetrag: ${mandant.totalBetrag.toFixed(2)}€

Bitte reichen Sie die Belege zeitnah nach, damit wir Ihre Buchhaltung abschließen können.

Mit freundlichen Grüßen
Ihre Kanzlei`;
  };

  const handleSend = async () => {
    setIsSending(true);
    
    // Simulate sending
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const mandantIds = mandantenWithItems.map(m => m.id);
    
    toast.success(
      `${mandantenWithItems.length} Anforderung${mandantenWithItems.length > 1 ? 'en' : ''} versendet`,
      {
        description: `${totalItems} fehlende Belege angefordert (${totalBetrag.toFixed(2)}€)`,
      }
    );

    onSendComplete?.(mandantIds);
    setIsSending(false);
    onOpenChange(false);
  };

  if (mandantenWithItems.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Belege anfordern</DialogTitle>
            <DialogDescription>
              Keine Mandanten mit fehlenden Belegen in der aktuellen Auswahl.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Belege anfordern
          </DialogTitle>
          <DialogDescription>
            {mandantenWithItems.length} Mandant{mandantenWithItems.length > 1 ? 'en' : ''} mit insgesamt {totalItems} fehlenden Belegen ({totalBetrag.toFixed(2)}€)
          </DialogDescription>
        </DialogHeader>

        {/* Channel Selection */}
        <div className="flex items-center gap-4 py-2">
          <Label className="text-sm text-muted-foreground">Kanal:</Label>
          <div className="flex gap-2">
            <Button
              variant={channel === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChannel('email')}
              className="gap-2"
            >
              <Mail className="h-4 w-4" />
              E-Mail
              {channel === 'email' && <Check className="h-3 w-3" />}
            </Button>
            <Button
              variant={channel === 'internal' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setChannel('internal')}
              className="gap-2 text-muted-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              Interne Nachricht
            </Button>
          </div>
        </div>

        {/* Threshold Filter */}
        <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label htmlFor="threshold-filter" className="text-sm">
              Nur Positionen &gt; {materialityThreshold}€
            </Label>
          </div>
          <Switch
            id="threshold-filter"
            checked={onlyAboveThreshold}
            onCheckedChange={setOnlyAboveThreshold}
          />
        </div>

        {/* Mandanten List with Preview */}
        <ScrollArea className="flex-1 min-h-0 max-h-[350px] pr-4">
          <div className="space-y-4">
            {mandantenWithItems.map((mandant, idx) => (
              <div key={mandant.id} className="space-y-2">
                {idx > 0 && <Separator />}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{mandant.clientName}</span>
                    <Badge variant="outline" className="text-xs">
                      {mandant.monthLabel}
                    </Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {mandant.missingItems.length} Beleg{mandant.missingItems.length > 1 ? 'e' : ''} · {mandant.totalBetrag.toFixed(2)}€
                  </span>
                </div>
                
                {/* Items Table */}
                <div className="bg-muted/30 rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2 font-medium text-muted-foreground">Datum</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Betrag</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Gegenpartei</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mandant.missingItems.map((item, itemIdx) => (
                        <tr key={itemIdx} className="border-b last:border-0">
                          <td className="p-2 text-muted-foreground">{item.datum}</td>
                          <td className="p-2 text-right font-medium">{item.betrag.toFixed(2)}€</td>
                          <td className="p-2">
                            {item.gegenpartei}
                            {item.verwendungszweck && (
                              <span className="text-muted-foreground text-xs ml-1">
                                ({item.verwendungszweck})
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Email Preview (collapsed by default, expandable) */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Vorschau Nachricht
                  </summary>
                  <Textarea
                    value={generateEmailText(mandant)}
                    readOnly
                    className="mt-2 text-xs h-32 bg-background font-mono"
                  />
                </details>
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              Nach Versand: Status → <Badge variant="secondary">Warten</Badge>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button 
                onClick={handleSend} 
                disabled={isSending}
                className="gap-2"
              >
                {isSending ? (
                  <>Wird gesendet...</>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    {channel === 'email' ? 'E-Mails senden' : 'Nachrichten senden'}
                    <Badge variant="secondary" className="ml-1">
                      {mandantenWithItems.length}
                    </Badge>
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
