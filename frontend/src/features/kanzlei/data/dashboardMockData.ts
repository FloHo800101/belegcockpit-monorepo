// Dashboard Mock Data for Kanzlei SFA
// Aggregated data per Mandant and Month

export interface DashboardMandantMonth {
  mandantId: string;
  mandantName: string;
  monthId: string;
  monthLabel: string;
  
  // Aggregated counts
  offenCount: number;           // caseStatus = 'open'
  riskCount: number;            // queueId = 'tax_risks' or risk-related triggers
  waitingCount: number;         // caseStatus = 'waiting_mandant'
  oldestWaitingDays: number | null;  // Difference from waitingSince to now
  
  // Activity
  lastActivity: string;         // Latest AuditTrail timestamp (ISO)
}

// Helper to calculate days ago
const daysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
};

// Mock Dashboard Data with 5+ Mandanten and 2+ Monate
export const dashboardMockData: DashboardMandantMonth[] = [
  // Müller GmbH - January 2026 (high risk, some waiting)
  {
    mandantId: 'mueller-gmbh',
    mandantName: 'Müller GmbH',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 15,
    riskCount: 4,
    waitingCount: 3,
    oldestWaitingDays: 7,
    lastActivity: daysAgo(2),
  },
  // Müller GmbH - December 2025 (mostly done)
  {
    mandantId: 'mueller-gmbh',
    mandantName: 'Müller GmbH',
    monthId: 'dezember-2025',
    monthLabel: 'Dezember 2025',
    offenCount: 2,
    riskCount: 0,
    waitingCount: 1,
    oldestWaitingDays: 14,
    lastActivity: daysAgo(5),
  },
  // Friseur König - January 2026 (many waiting, long time)
  {
    mandantId: 'friseur-koenig',
    mandantName: 'Friseur König',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 8,
    riskCount: 0,
    waitingCount: 5,
    oldestWaitingDays: 12,
    lastActivity: daysAgo(4),
  },
  // Bau & Co KG - January 2026 (risk focus)
  {
    mandantId: 'bau-co-kg',
    mandantName: 'Bau & Co KG',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 22,
    riskCount: 6,
    waitingCount: 2,
    oldestWaitingDays: 3,
    lastActivity: daysAgo(1),
  },
  // Bau & Co KG - December 2025 (some open)
  {
    mandantId: 'bau-co-kg',
    mandantName: 'Bau & Co KG',
    monthId: 'dezember-2025',
    monthLabel: 'Dezember 2025',
    offenCount: 5,
    riskCount: 1,
    waitingCount: 0,
    oldestWaitingDays: null,
    lastActivity: daysAgo(8),
  },
  // Café Schmidt - January 2026 (newly handed over)
  {
    mandantId: 'cafe-schmidt',
    mandantName: 'Café Schmidt',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 11,
    riskCount: 2,
    waitingCount: 0,
    oldestWaitingDays: null,
    lastActivity: daysAgo(0), // today
  },
  // IT Solutions Nord GmbH - January 2026 (waiting long)
  {
    mandantId: 'it-solutions-nord',
    mandantName: 'IT Solutions Nord GmbH',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 6,
    riskCount: 1,
    waitingCount: 4,
    oldestWaitingDays: 18,
    lastActivity: daysAgo(6),
  },
  // Autohaus Meyer - January 2026 (low priority)
  {
    mandantId: 'autohaus-meyer',
    mandantName: 'Autohaus Meyer',
    monthId: 'januar-2026',
    monthLabel: 'Januar 2026',
    offenCount: 3,
    riskCount: 0,
    waitingCount: 0,
    oldestWaitingDays: null,
    lastActivity: daysAgo(3),
  },
];

// Sort function for dashboard data
export type DashboardSortMode = 'risk' | 'waiting' | 'recent' | null;

export function sortDashboardData(
  data: DashboardMandantMonth[],
  mode: DashboardSortMode
): DashboardMandantMonth[] {
  const sorted = [...data];
  
  switch (mode) {
    case 'waiting':
      // Filter to waiting > 0, then sort by oldest waiting days desc
      return sorted
        .filter(d => d.waitingCount > 0)
        .sort((a, b) => (b.oldestWaitingDays ?? 0) - (a.oldestWaitingDays ?? 0));
    
    case 'recent':
      // Sort by lastActivity desc (newest first)
      return sorted.sort((a, b) => 
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    
    case 'risk':
    default:
      // Default: risk desc → waiting desc → open desc → activity asc
      return sorted.sort((a, b) => {
        // 1. Risk count desc
        if (b.riskCount !== a.riskCount) return b.riskCount - a.riskCount;
        // 2. Waiting count desc
        if (b.waitingCount !== a.waitingCount) return b.waitingCount - a.waitingCount;
        // 3. Open count desc
        if (b.offenCount !== a.offenCount) return b.offenCount - a.offenCount;
        // 4. Last activity asc (older first)
        return new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
      });
  }
}

// Helper to format relative time in German
export function formatRelativeTime(isoDate: string): string {
  const now = new Date();
  const date = new Date(isoDate);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'heute';
  if (diffDays === 1) return 'gestern';
  return `vor ${diffDays} Tagen`;
}
