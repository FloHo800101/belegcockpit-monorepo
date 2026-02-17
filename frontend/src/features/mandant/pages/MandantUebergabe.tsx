import { useNavigate, useParams } from 'react-router-dom';
import { useBelegStore } from '@/store/belegStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, ArrowLeft, Send, FileText, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function MandantUebergabe() {
  const navigate = useNavigate();
  const { monthId } = useParams();
  const { counts, state } = useBelegStore();
  const { toast } = useToast();

  // Format month label from ID
  const monthLabel = monthId === 'januar-2026' 
    ? 'Januar 2026' 
    : monthId === 'dezember-2025'
    ? 'Dezember 2025'
    : monthId?.replace('-', ' ').replace(/^\w/, c => c.toUpperCase()) || 'Monat';

  const handleSubmit = () => {
    toast({
      title: 'Monat übergeben',
      description: `${monthLabel} wurde erfolgreich an die Kanzlei übergeben.`,
    });
    navigate('/kanzlei');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0">
        <div className="p-4 border-b border-sidebar-border">
          <div 
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate('/mandant')}
          >
            <FileText className="h-6 w-6 text-sidebar-primary" />
            <span className="font-semibold">BelegCockpit</span>
          </div>
        </div>
        <div className="p-4">
          <div className="text-sm text-sidebar-foreground/70 mb-2">Übergabe</div>
          <div className="font-medium text-sidebar-foreground">{monthLabel}</div>
        </div>

        {/* Rollen-Wechsel */}
        <div className="mt-auto p-4 border-t border-sidebar-border">
          <button
            onClick={() => navigate('/kanzlei')}
            className="flex items-center gap-2 px-3 py-2 rounded w-full text-left text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <Building2 className="h-4 w-4" />
            Zur Kanzlei wechseln
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-xl mx-auto space-y-8">
          <Button 
            variant="ghost" 
            onClick={() => navigate(`/mandant/monat/${monthId}`)}
            className="mb-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Zurück
          </Button>

          <div className="text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Send className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold">An Steuerkanzlei übergeben</h1>
            <p className="text-muted-foreground">
              Sie sind dabei, {monthLabel} an Ihre Steuerkanzlei zu übergeben. 
              Die Kanzlei wird offene Punkte prüfen und bei Bedarf Rückfragen stellen.
            </p>
          </div>

          <Card>
            <CardContent className="pt-6">
              <h3 className="font-medium mb-4">Zusammenfassung {monthLabel}</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Transaktionen gesamt</span>
                  <span className="font-medium">{counts.total}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">Belege erkannt</span>
                  <span className="font-medium">{state.documents.length}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-confident))]" />
                    <span className="text-muted-foreground">Sicher zugeordnet</span>
                  </div>
                  <span className="font-medium text-[hsl(var(--status-confident))]">{counts.confident}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-uncertain))]" />
                    <span className="text-muted-foreground">Zur Prüfung</span>
                  </div>
                  <span className="font-medium text-[hsl(var(--status-uncertain))]">{counts.uncertain}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[hsl(var(--status-missing))]" />
                    <span className="text-muted-foreground">Offen</span>
                  </div>
                  <span className="font-medium text-[hsl(var(--status-missing))]">{counts.missing}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            <p>
              <strong>Hinweis:</strong> Nach der Übergabe können Sie weiterhin Belege nachreichen. 
              Ihre Kanzlei wird Sie kontaktieren, falls Rückfragen bestehen.
            </p>
          </div>

          <div className="flex gap-4">
            <Button className="flex-1" onClick={handleSubmit}>
              <Check className="mr-2 h-4 w-4" /> Jetzt übergeben
            </Button>
            <Button 
              variant="outline" 
              onClick={() => navigate(`/mandant/monat/${monthId}`)}
            >
              Abbrechen
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
