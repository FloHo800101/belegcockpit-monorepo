import { useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';

export type WizardStep = 'setup' | 'offene-punkte' | 'cluster-detail' | 'unsichere-matches' | 'abschluss';

export function useWizardNavigation() {
  const { monthId, clusterId } = useParams<{ monthId: string; clusterId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Check if we're on the new month route (either /mandant/monat/neu or no monthId)
  const isNewMonth = !monthId || monthId === 'neu' || location.pathname.includes('/monat/neu');

  // Derive current step from pathname
  const currentStep = useMemo((): WizardStep => {
    const path = location.pathname;
    // /mandant/monat/neu is the setup step
    if (path.endsWith('/monat/neu')) return 'setup';
    if (path.includes('/setup')) return 'setup';
    if (path.includes('/offene-punkte/') && clusterId) return 'cluster-detail';
    if (path.includes('/offene-punkte')) return 'offene-punkte';
    if (path.includes('/unsichere-matches')) return 'unsichere-matches';
    if (path.includes('/abschluss')) return 'abschluss';
    return 'setup';
  }, [location.pathname, clusterId]);

  // Navigation functions
  const goToSetup = () => navigate('/mandant/monat/neu/setup');
  
  const goToOpenItems = (newMonthId?: string) => {
    const targetMonth = newMonthId || monthId;
    navigate(`/mandant/monat/${targetMonth}/offene-punkte`);
  };

  // For use as onClick handler (ignores event)
  const goToOpenItemsHandler = () => goToOpenItems();
  
  const goToCluster = (targetClusterId: string) => {
    navigate(`/mandant/monat/${monthId}/offene-punkte/${targetClusterId}`);
  };
  
  const goToUncertainMatches = () => {
    navigate(`/mandant/monat/${monthId}/unsichere-matches`);
  };
  
  const goToCompletion = () => {
    navigate(`/mandant/monat/${monthId}/abschluss`);
  };

  // Navigate to next cluster (cycles through available clusters)
  const clusterOrder = [
    'cluster_important_missing_high',
    'cluster_missing_small',
    'cluster_monthly_invoices',
    'cluster_marketplace',
    'cluster_other_open',
  ];
  
  const goToNextCluster = () => {
    if (!clusterId) {
      goToCluster(clusterOrder[0]);
      return;
    }
    const currentIndex = clusterOrder.indexOf(clusterId);
    if (currentIndex === -1 || currentIndex === clusterOrder.length - 1) {
      // Go to uncertain matches after last cluster
      goToUncertainMatches();
    } else {
      goToCluster(clusterOrder[currentIndex + 1]);
    }
  };

  const goToDashboard = () => navigate('/mandant');
  const goToKanzlei = () => navigate('/kanzlei');
  const goToMeineDaten = () => navigate('/mandant/meine-daten');
  const goToLanding = () => navigate('/');

  // Step index for progress indicator (0-based, now 4 steps)
  const stepIndex = useMemo(() => {
    switch (currentStep) {
      case 'setup': return 0;
      case 'offene-punkte': 
      case 'cluster-detail': return 1;
      case 'unsichere-matches': return 2;
      case 'abschluss': return 3;
      default: return 0; // Default to first step (setup)
    }
  }, [currentStep]);

  // Format month label from ID
  const getMonthLabel = (id: string | undefined) => {
    if (!id) return 'Monat';
    const monthMap: Record<string, string> = {
      'januar-2026': 'Januar 2026',
      'dezember-2025': 'Dezember 2025',
      'november-2025': 'November 2025',
      'februar-2026': 'Februar 2026',
      'maerz-2026': 'März 2026',
      'april-2026': 'April 2026',
    };
    return monthMap[id] || id.replace('-', ' ').replace(/^\w/, c => c.toUpperCase());
  };

  const monthLabel = getMonthLabel(monthId);

  return {
    monthId: monthId ?? '',
    clusterId: clusterId ?? '',
    isNewMonth,
    currentStep,
    stepIndex,
    monthLabel,
    getMonthLabel,
    // Navigation
    goToSetup,
    goToOpenItems,
    goToOpenItemsHandler,
    goToCluster,
    goToUncertainMatches,
    goToCompletion,
    goToNextCluster,
    goToDashboard,
    goToKanzlei,
    goToMeineDaten,
    goToLanding,
  };
}
