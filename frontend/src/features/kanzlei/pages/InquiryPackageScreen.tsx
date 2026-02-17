// Rückfragenpaket Screen - SFA Phase 1 (Copy & Paste)
// Route: /kanzlei/mandant/:mandantId/monat/:monthId/rueckfragen

import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, Copy, Check, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useInquiryPackage } from '../stores/inquiryPackageStore';
import { generateSfaCases } from '../data/sfaMockData';
import { SfaCase, SfaQueueId } from '@/data/types';

// Demo items for seeding when store is empty
const DEMO_ITEMS = [
  { caseId: 'missing_receipts-case-1', questionText: 'Bitte Rechnung hochladen oder erklären, wofür diese Zahlung war.' },
  { caseId: 'clarify_matching-case-1', questionText: 'Welcher Beleg gehört zu dieser Zahlung?' },
  { caseId: 'fees_misc-case-1', questionText: 'Handelt es sich um eine Bankgebühr oder eine geschäftliche Ausgabe?' },
];

export default function InquiryPackageScreen() {
  const { mandantId, monthId } = useParams<{ mandantId: string; monthId: string }>();
  const navigate = useNavigate();
  const inquiryPackage = useInquiryPackage();
  
  // Local state
  const [copied, setCopied] = useState(false);
  const [editableText, setEditableText] = useState('');
  const [allCases, setAllCases] = useState<SfaCase[]>([]);

  // Load all cases to get details
  useEffect(() => {
    const cases: SfaCase[] = [];
    const queues: SfaQueueId[] = ['missing_receipts', 'clarify_matching', 'tax_risks', 'duplicates_corrections', 'fees_misc'];
    queues.forEach(queueId => {
      cases.push(...generateSfaCases(queueId));
    });
    setAllCases(cases);
  }, []);

  // Set context and seed demo items if empty
  useEffect(() => {
    if (mandantId && monthId) {
      inquiryPackage.setContext(mandantId, monthId);
      
      // Seed demo items if store is empty (for demo purposes)
      if (inquiryPackage.getItemCount() === 0) {
        DEMO_ITEMS.forEach(item => {
          inquiryPackage.addItem(item.caseId, item.questionText);
        });
      }
    }
  }, [mandantId, monthId]);

  // Get case details helper
  const getCaseDetails = (caseId: string) => {
    const c = allCases.find(cs => cs.id === caseId);
    if (!c) return null;
    return { counterparty: c.counterparty, amount: c.amount, date: c.date };
  };

  // Generate email text (German format)
  const generateFormattedEmailText = useMemo(() => {
    const items = inquiryPackage.state.items;
    if (items.length === 0) return '';
    
    const mandantName = mandantId === 'demo-mandant' ? 'Mustermann GmbH' : 'Mandant';
    const monthName = monthId?.replace('-', ' ').replace(/^\w/, c => c.toUpperCase()) || 'Januar 2026';
    
    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
    
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    let text = `Hallo ${mandantName},\n\n`;
    text += `für den Abschluss ${monthName} benötigen wir noch folgende Informationen/Belege:\n\n`;
    
    items.forEach((item, index) => {
      const details = getCaseDetails(item.caseId);
      if (details) {
        text += `${index + 1}) ${formatDate(details.date)} · ${details.counterparty} · ${formatCurrency(details.amount)}\n`;
        text += `   → ${item.questionText}\n\n`;
      }
    });
    
    text += `Vielen Dank und viele Grüße\nDein Steuerberater-Team`;
    
    return text;
  }, [inquiryPackage.state.items, allCases, mandantId, monthId]);

  // Update editable text when generated text changes
  useEffect(() => {
    setEditableText(generateFormattedEmailText);
  }, [generateFormattedEmailText]);

  // Handle copy to clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(editableText);
      setCopied(true);
      
      // Get count before clearing
      const itemCount = inquiryPackage.getItemCount();
      
      // Clear the package
      inquiryPackage.clearPackage();
      
      // Navigate back with success message
      setTimeout(() => {
        navigate(`/kanzlei/mandant/${mandantId}`, {
          state: { 
            message: `Rückfragen kopiert. ${itemCount} Fälle warten jetzt auf den Mandanten.`
          }
        });
      }, 500);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    navigate(`/kanzlei/mandant/${mandantId}`);
  };

  // Handle remove item
  const handleRemoveItem = (caseId: string) => {
    inquiryPackage.removeItem(caseId);
  };

  // Format helpers
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // Get display data
  const mandantName = mandantId === 'demo-mandant' ? 'Mustermann GmbH' : 'Mandant';
  const monthName = monthId?.replace('-', ' ').replace(/^\w/, c => c.toUpperCase()) || 'Januar 2026';
  const items = inquiryPackage.state.items;
  const isEmpty = items.length === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/kanzlei/mandant/${mandantId}`)}
            className="gap-2 mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zum Cockpit
          </Button>
          
          <h1 className="text-2xl font-semibold">
            Rückfragen an {mandantName} – {monthName}
          </h1>
          <p className="text-muted-foreground mt-1">
            Kopiere den Text und sende ihn per E-Mail an den Mandanten.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {isEmpty ? (
          /* Empty State */
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Noch keine Rückfragen gesammelt</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Füge in der Workbench Fälle über „Zu Rückfragen hinzufügen" hinzu.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(`/kanzlei/mandant/${mandantId}/monat/${monthId}/cluster/missing_receipts`)}
              >
                Zur Workbench
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Two Column Layout */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: List of inquiry items */}
            <div>
              <h2 className="text-lg font-medium mb-4">
                Enthaltene Rückfragen ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((item) => {
                  const details = getCaseDetails(item.caseId);
                  if (!details) return null;
                  
                  return (
                    <Card key={item.caseId}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-1">
                              <span>{formatDate(details.date)}</span>
                              <span>·</span>
                              <span className="font-medium text-foreground">
                                {formatCurrency(details.amount)}
                              </span>
                            </div>
                            <p className="font-medium truncate">{details.counterparty}</p>
                            <p className="text-sm text-muted-foreground mt-2 italic">
                              „{item.questionText}"
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(item.caseId)}
                            className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Right: Editable email text */}
            <div>
              <h2 className="text-lg font-medium mb-4">Generierter E-Mail-Text</h2>
              <Textarea
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                className="min-h-[400px] font-mono text-sm resize-none"
                placeholder="Der E-Mail-Text wird automatisch generiert..."
              />
              <p className="text-xs text-muted-foreground mt-2">
                Du kannst den Text vor dem Kopieren anpassen.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {!isEmpty && (
        <div className="border-t bg-background sticky bottom-0">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <Button variant="outline" onClick={handleCancel}>
              Abbrechen
            </Button>
            <Button onClick={handleCopyText} className="gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Text kopiert
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Text kopieren
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
