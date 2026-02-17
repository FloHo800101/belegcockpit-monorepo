import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useBelegStore } from '@/store/belegStore';
import { useWizardNavigation } from './hooks/useWizardNavigation';
import { WizardFooterBar } from '@/features/mandant/components/WizardFooterBar';
import { HandoverMonthDialog } from '@/features/mandant/components/HandoverMonthDialog';
import { initialReviewItems } from '@/data/mockData';

// Cluster packages for open items - mapped to actual store data
const CLUSTER_PACKAGES = [
  {
    id: "cluster_important_missing_high",
    packageKey: "top_amounts",
    priority: "important",
    priorityLabel: "Wichtig",
    title: "Beleg fehlt (hoher Betrag)",
    explanation: "Bei diesen größeren Zahlungen fehlt noch der Beleg. Bitte zuerst prüfen."
  },
  {
    id: "cluster_normal_missing",
    packageKey: "other_open",
    priority: "normal",
    priorityLabel: "Normal",
    title: "Beleg fehlt",
    explanation: "Zu diesen Zahlungen wurde kein passender Beleg gefunden."
  },
  {
    id: "cluster_normal_bundle",
    packageKey: "bundles",
    priority: "normal",
    priorityLabel: "Normal",
    title: "Sammelzahlungen & Sammelbelege",
    explanation: "Hier könnten mehrere Zahlungen oder Belege zusammengehören."
  },
  {
    id: "cluster_normal_subscriptions",
    packageKey: "subscriptions",
    priority: "normal",
    priorityLabel: "Normal",
    title: "Mögliche Abos & Verträge",
    explanation: "Diese Zahlungen wiederholen sich regelmäßig – vielleicht ein Abo?"
  },
  {
    id: "cluster_low_refund",
    packageKey: "refunds",
    priority: "low",
    priorityLabel: "Niedrig",
    title: "Erstattung / Gutschrift",
    explanation: "Hier wurde Geld zurückgebucht. Meist unproblematisch."
  },
  {
    id: "cluster_low_small",
    packageKey: "small_no_receipt",
    priority: "low",
    priorityLabel: "Niedrig",
    title: "Kleinbeträge",
    explanation: "Kleine Ausgaben wie Parkgebühren oder Trinkgeld – oft ohne Beleg."
  }
];

// Helper to get badge variant based on priority
const getPriorityBadgeVariant = (priority: string): "destructive" | "default" | "secondary" | "outline" => {
  switch (priority) {
    case 'important': return 'destructive';
    case 'normal': return 'default';
    case 'low': return 'secondary';
    default: return 'outline';
  }
};

export default function OpenItems() {
  const location = useLocation();
  const { counts, packageCounts } = useBelegStore();
  const { goToCluster, goToDashboard, goToUncertainMatches, goToCompletion } = useWizardNavigation();
  const [showHandoverDialog, setShowHandoverDialog] = useState(false);

  // Calculate total open from actual package counts
  const getClusterCount = (packageKey: string): number => {
    return packageCounts[packageKey] || 0;
  };

  const totalOpen = CLUSTER_PACKAGES.reduce((sum, cluster) => sum + getClusterCount(cluster.packageKey), 0);
  const totalResolved = counts.resolved;
  const progress = totalOpen > 0 ? Math.round((totalResolved / (totalOpen + totalResolved)) * 100) : 100;

  // Filter out clusters with 0 items
  const activeClusters = CLUSTER_PACKAGES.filter(cluster => getClusterCount(cluster.packageKey) > 0);

  // Get review count (uncertain matches) from mock data
  const reviewCount = initialReviewItems.length;

  // Handle handover to Kanzlei - always go to completion
  const handleHandoverConfirm = () => {
    setShowHandoverDialog(false);
    goToCompletion();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Offene Punkte erledigen</h2>
            <Badge variant="outline">{totalOpen} offen</Badge>
          </div>
          <Progress value={progress} className="h-2" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeClusters.map((cluster) => {
              const count = getClusterCount(cluster.packageKey);
              
              return (
                <Card 
                  key={cluster.id} 
                  className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all" 
                  onClick={() => goToCluster(cluster.id)}
                >
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start gap-2">
                      <Badge variant={getPriorityBadgeVariant(cluster.priority)} className="text-xs">
                        {cluster.priorityLabel}
                      </Badge>
                      <Badge variant="outline" className="flex-shrink-0">
                        {count} {count === 1 ? 'Zahlung' : 'Zahlungen'}
                      </Badge>
                    </div>
                    <CardTitle className="text-base leading-tight mt-3">{cluster.title}</CardTitle>
                    <CardDescription className="text-sm mt-1 leading-relaxed">
                      {cluster.explanation}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>

          {activeClusters.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium">Keine offenen Punkte 🎉</p>
              <p className="text-sm mt-1">Alle Aufgaben wurden erledigt.</p>
            </div>
          )}

          {/* Alternative View Highlight */}
          <Card className="mt-6 border-2 border-dashed border-primary/40 bg-primary/5">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">Hier finden Sie eine alternative Darstellung</CardTitle>
              <CardDescription className="text-sm mt-1">
                Testen Sie unseren neuen Akkordeon-Flow für eine kompaktere Übersicht.
              </CardDescription>
              <Link
                to="/mandant/test-progressive-disclosures"
                state={{ returnTo: location.pathname }}
                className="inline-flex items-center mt-3 text-sm font-medium text-primary hover:underline"
              >
                Akkordeon-Flow öffnen →
              </Link>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* Unified Wizard Footer */}
      <WizardFooterBar
        onBack={goToDashboard}
        backLabel="Zurück"
        onNext={goToUncertainMatches}
        nextLabel="Weiter zu Zu prüfende Punkte"
        onHandoverToKanzlei={() => setShowHandoverDialog(true)}
      />

      {/* Handover Dialog */}
      <HandoverMonthDialog
        open={showHandoverDialog}
        onOpenChange={setShowHandoverDialog}
        onConfirm={handleHandoverConfirm}
        openCount={totalOpen}
        reviewCount={reviewCount}
      />
    </div>
  );
}
