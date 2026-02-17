import { useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { AlertTriangle, Package, FileX, HelpCircle, AlertCircle, Copy, Receipt, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useBelegStore } from '@/store/belegStore';
import { CLUSTER_CONFIG, KanzleiCluster, SfaQueueId, SFA_QUEUE_CONFIG } from '@/data/types';
import { useInquiryPackage } from '@/features/kanzlei/stores/inquiryPackageStore';

// 5 Haupt-Queues (Arbeitskörbe) Konfiguration
const MAIN_QUEUES: {
  id: SfaQueueId;
  icon: React.ElementType;
  clusters: KanzleiCluster[]; // Mapped to existing cluster counts
}[] = [
  {
    id: 'missing_receipts',
    icon: FileX,
    clusters: ['missing'],
  },
  {
    id: 'clarify_matching',
    icon: HelpCircle,
    clusters: ['vendor_unknown', 'one_to_many', 'many_to_one', 'amount_variance'],
  },
  {
    id: 'tax_risks',
    icon: AlertTriangle,
    clusters: ['tax_risk', 'anomaly'],
  },
  {
    id: 'duplicates_corrections',
    icon: Copy,
    clusters: ['duplicate_risk', 'refund_reversal'],
  },
  {
    id: 'fees_misc',
    icon: Receipt,
    clusters: ['fees', 'timing'],
  },
];

export default function MandantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clusterCounts } = useBelegStore();
  const inquiryPackage = useInquiryPackage();

  // Set context for inquiry package (mock month for this demo)
  const monthId = 'januar-2026';
  
  // Use useEffect for state updates to avoid render-time side effects
  useEffect(() => {
    if (id) {
      inquiryPackage.setContext(id, monthId);
    }
  }, [id, monthId, inquiryPackage]);
  
  const inquiryCount = inquiryPackage.getItemCount();

  // Get mandant name from ID (map common IDs to display names)
  const getMandantDisplayName = (mandantId: string | undefined): string => {
    const nameMap: Record<string, string> = {
      'mueller-gmbh': 'Müller GmbH',
      'bau-co-kg': 'Bau & Co KG',
      'friseur-koenig': 'Friseur König',
      'cafe-schmidt': 'Café Schmidt',
      'it-solutions-nord': 'IT Solutions Nord GmbH',
      'autohaus-meyer': 'Autohaus Meyer',
    };
    return mandantId ? (nameMap[mandantId] || mandantId) : 'Unbekannt';
  };
  
  const mandantName = getMandantDisplayName(id);

  // Calculate queue counts from cluster counts
  const getQueueCount = (clusters: KanzleiCluster[]) => {
    return clusters.reduce((sum, cluster) => sum + (clusterCounts[cluster] || 0), 0);
  };

  // Calculate SFA KPIs
  const totalOpen = Object.values(clusterCounts).reduce((sum, count) => sum + count, 0);
  const riskCount = (clusterCounts['tax_risk'] || 0) + (clusterCounts['anomaly'] || 0) + (clusterCounts['duplicate_risk'] || 0);
  // Mock "Wartet auf Mandant" - in real app would come from actual case statuses
  const waitingCount = Math.floor(totalOpen * 0.15);
  const readyForClose = totalOpen === 0 && waitingCount === 0;

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-[1720px]">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">{mandantName} – Januar 2026</h1>
          <div className="flex items-center gap-3">
            <Link to={`/kanzlei/mandant/${id}/risk`}>
              <Button variant="outline" size="sm">
                <AlertTriangle className="mr-2 h-4 w-4" /> Risikofälle öffnen
              </Button>
            </Link>
          </div>
        </div>

        {/* Rückfragenpaket CTA Block */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardContent className="flex items-center justify-between py-4">
            <div>
              <h3 className="font-semibold text-base">Rückfragenpaket</h3>
              <p className="text-sm text-muted-foreground">
                {inquiryCount > 0 
                  ? 'Gesammelte Rückfragen an den Mandanten (Copy & Paste per E-Mail).'
                  : 'Noch keine Rückfragen gesammelt.'}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate(`/kanzlei/mandant/${id}/monat/${monthId}/rueckfragen`)}
              disabled={inquiryCount === 0}
              className="gap-2"
            >
              <Package className="h-4 w-4" />
              Rückfragenpaket öffnen {inquiryCount > 0 && `(${inquiryCount})`}
            </Button>
          </CardContent>
        </Card>

        {/* SFA KPI Bar */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-primary">{totalOpen}</div>
              <div className="text-sm text-muted-foreground">Offen</div>
            </CardContent>
          </Card>
          <Card className={riskCount > 0 ? 'border-destructive/50' : ''}>
            <CardContent className="pt-4 text-center">
              <div className={`text-2xl font-bold ${riskCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {riskCount}
              </div>
              <div className="text-sm text-muted-foreground">Risikofälle</div>
            </CardContent>
          </Card>
          <Card className={waitingCount > 0 ? 'border-amber-500/50' : ''}>
            <CardContent className="pt-4 text-center">
              <div className={`text-2xl font-bold ${waitingCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {waitingCount}
              </div>
              <div className="text-sm text-muted-foreground">Wartet auf Mandant</div>
            </CardContent>
          </Card>
          <Card className={readyForClose ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/20' : ''}>
            <CardContent className="pt-4 text-center">
              {readyForClose ? (
                <>
                  <div className="text-2xl font-bold text-emerald-600">✓</div>
                  <div className="text-sm text-emerald-600 font-medium">Bereit für Abschluss</div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold text-muted-foreground">–</div>
                  <div className="text-sm text-muted-foreground">Bereit für Abschluss</div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 5 Haupt-Queues (Arbeitskörbe) */}
        <h2 className="text-lg font-semibold mb-4">Arbeitskörbe</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {MAIN_QUEUES.map((queue) => {
            const config = SFA_QUEUE_CONFIG[queue.id];
            const count = getQueueCount(queue.clusters);
            const Icon = queue.icon;
            
            return (
              <Card 
                key={queue.id} 
                className={`cursor-pointer transition-all hover:shadow-md hover:border-primary/50 ${
                  count > 0 ? 'border-l-4 border-l-primary' : ''
                }`}
                onClick={() => navigate(`/kanzlei/mandant/${id}/cluster/${queue.id}`)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">{config.label}</CardTitle>
                    </div>
                    <Badge variant={count > 0 ? 'default' : 'secondary'} className="text-sm">
                      {count}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pb-4">
                  <p className="text-sm text-muted-foreground mb-3">{config.description}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    disabled={count === 0}
                  >
                    Bearbeiten
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Weitere Cluster (Details) - Accordion */}
        <Accordion type="single" collapsible className="border rounded-lg">
          <AccordionItem value="detail-clusters" className="border-none">
            <AccordionTrigger className="px-4 py-3 hover:no-underline">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Weitere Cluster (Details)</span>
                <Badge variant="outline" className="font-normal">
                  {Object.keys(CLUSTER_CONFIG).length} Kategorien
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <p className="text-sm text-muted-foreground mb-4">
                Detaillierte Aufschlüsselung nach Prüfkategorien. Für Power-User, die in Spezialcluster springen möchten.
              </p>
              <div className="grid md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {(Object.keys(CLUSTER_CONFIG) as KanzleiCluster[]).map(cluster => {
                  const config = CLUSTER_CONFIG[cluster];
                  const count = clusterCounts[cluster] || 0;
                  return (
                    <Link key={cluster} to={`/kanzlei/mandant/${id}/cluster/${cluster}`}>
                      <Card className="h-full hover:border-primary/50 transition-colors">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-sm font-medium">{config.label}</span>
                            <Badge variant="secondary" className="text-xs">{count}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{config.description}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
