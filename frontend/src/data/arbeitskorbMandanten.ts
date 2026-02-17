// Führende Mandanten-Daten für Arbeitskorb und Mandanten-Übersicht
// Diese Datei ist die Single Source of Truth für alle Mandanten-Listen

export type MandantStatus = 'OVERDUE' | 'WAITING' | 'REVIEW' | 'READY';
export type PendingReason = 'BELEG_ANFORDERUNG_OFFEN' | 'RUECKFRAGE_OFFEN';
export type ActivityActor = 'MANDANT' | 'KANZLEI';

export interface MandantRow {
  id: string;
  clientName: string;
  monthLabel: string;
  status: MandantStatus;
  missingCount: number;
  unsureCount: number;
  openAmountTotal: number;
  dueInDays: number;
  lastActivityAt: string;
  lastActivityActor?: ActivityActor;
  lastRequestAt?: string;
  pendingReason?: PendingReason;
  requestedItemsCount?: number;
  hasNewUpload: boolean;
  hasNewAnswer: boolean;
  hasDeviation: boolean;
  riskFlag: boolean;
}

// Mock data - Single Source of Truth
export const mandantenData: MandantRow[] = [
  {
    id: 'mueller-gmbh',
    clientName: 'Müller GmbH',
    monthLabel: 'Nov 25',
    status: 'OVERDUE',
    missingCount: 3,
    unsureCount: 0,
    openAmountTotal: 420,
    dueInDays: -5,
    lastActivityAt: '2026-01-07T10:30:00Z',
    lastActivityActor: 'KANZLEI',
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'hoffmann-consult',
    clientName: 'Hoffmann Consult',
    monthLabel: 'Dez 25',
    status: 'REVIEW',
    missingCount: 0,
    unsureCount: 2,
    openAmountTotal: 110,
    dueInDays: 2,
    lastActivityAt: '2026-01-12T08:15:00Z',
    lastActivityActor: 'MANDANT',
    hasNewUpload: true,
    hasNewAnswer: false,
    hasDeviation: true,
    riskFlag: true,
  },
  {
    id: 'friseur-sonne',
    clientName: 'Friseur Sonne',
    monthLabel: 'Nov 25',
    status: 'READY',
    missingCount: 0,
    unsureCount: 0,
    openAmountTotal: 0,
    dueInDays: 10,
    lastActivityAt: '2026-01-09T09:00:00Z',
    lastActivityActor: 'MANDANT',
    hasNewUpload: true,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'baeckerei-schmidt',
    clientName: 'Bäckerei Schmidt',
    monthLabel: 'Nov 25',
    status: 'OVERDUE',
    missingCount: 5,
    unsureCount: 0,
    openAmountTotal: 890,
    dueInDays: -10,
    lastActivityAt: '2026-01-04T14:00:00Z',
    lastActivityActor: 'KANZLEI',
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'autohaus-krause',
    clientName: 'Autohaus Krause',
    monthLabel: 'Dez 25',
    status: 'WAITING',
    missingCount: 1,
    unsureCount: 0,
    openAmountTotal: 55,
    dueInDays: 1,
    lastActivityAt: '2026-01-08T16:00:00Z',
    lastActivityActor: 'MANDANT',
    lastRequestAt: '2026-01-05T10:00:00Z',
    pendingReason: 'BELEG_ANFORDERUNG_OFFEN',
    requestedItemsCount: 2,
    hasNewUpload: false,
    hasNewAnswer: true,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'it-solutions',
    clientName: 'IT Solutions GmbH',
    monthLabel: 'Nov 25',
    status: 'REVIEW',
    missingCount: 0,
    unsureCount: 4,
    openAmountTotal: 320,
    dueInDays: 0,
    lastActivityAt: '2026-01-12T10:30:00Z',
    lastActivityActor: 'MANDANT',
    hasNewUpload: true,
    hasNewAnswer: false,
    hasDeviation: true,
    riskFlag: true,
  },
  {
    id: 'cafe-central',
    clientName: 'Café Central',
    monthLabel: 'Okt 25',
    status: 'OVERDUE',
    missingCount: 2,
    unsureCount: 0,
    openAmountTotal: 180,
    dueInDays: -3,
    lastActivityAt: '2026-01-06T11:00:00Z',
    lastActivityActor: 'KANZLEI',
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'praxis-meyer',
    clientName: 'Praxis Dr. Meyer',
    monthLabel: 'Dez 25',
    status: 'WAITING',
    missingCount: 0,
    unsureCount: 0,
    openAmountTotal: 0,
    dueInDays: 5,
    lastActivityAt: '2026-01-07T09:30:00Z',
    lastActivityActor: 'KANZLEI',
    lastRequestAt: '2026-01-03T14:00:00Z',
    pendingReason: 'RUECKFRAGE_OFFEN',
    requestedItemsCount: 0,
    hasNewUpload: false,
    hasNewAnswer: true,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'weber-handwerk',
    clientName: 'Weber Handwerk',
    monthLabel: 'Nov 25',
    status: 'REVIEW',
    missingCount: 0,
    unsureCount: 1,
    openAmountTotal: 75,
    dueInDays: 3,
    lastActivityAt: '2026-01-09T10:00:00Z',
    lastActivityActor: 'KANZLEI',
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: true,
    riskFlag: true,
  },
  {
    id: 'blumen-paradies',
    clientName: 'Blumen Paradies',
    monthLabel: 'Nov 25',
    status: 'OVERDUE',
    missingCount: 4,
    unsureCount: 0,
    openAmountTotal: 520,
    dueInDays: -7,
    lastActivityAt: '2026-01-05T13:00:00Z',
    lastActivityActor: 'KANZLEI',
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'mode-haus',
    clientName: 'Mode Haus Elegance',
    monthLabel: 'Dez 25',
    status: 'READY',
    missingCount: 0,
    unsureCount: 0,
    openAmountTotal: 0,
    dueInDays: 14,
    lastActivityAt: '2026-01-09T08:30:00Z',
    lastActivityActor: 'MANDANT',
    hasNewUpload: true,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
  {
    id: 'elektro-service',
    clientName: 'Elektro Service Plus',
    monthLabel: 'Nov 25',
    status: 'WAITING',
    missingCount: 2,
    unsureCount: 0,
    openAmountTotal: 35,
    dueInDays: -1,
    lastActivityAt: '2026-01-08T11:00:00Z',
    lastActivityActor: 'KANZLEI',
    lastRequestAt: '2026-01-06T09:00:00Z',
    pendingReason: 'BELEG_ANFORDERUNG_OFFEN',
    requestedItemsCount: 3,
    hasNewUpload: false,
    hasNewAnswer: false,
    hasDeviation: false,
    riskFlag: false,
  },
];

// Convert month label to full month format for Mandanten-Übersicht
const monthLabelToFull = (label: string): string => {
  const monthMap: Record<string, string> = {
    'Jan': 'Januar',
    'Feb': 'Februar',
    'Mär': 'März',
    'Apr': 'April',
    'Mai': 'Mai',
    'Jun': 'Juni',
    'Jul': 'Juli',
    'Aug': 'August',
    'Sep': 'September',
    'Okt': 'Oktober',
    'Nov': 'November',
    'Dez': 'Dezember',
  };
  const [mon, year] = label.split(' ');
  const fullMonth = monthMap[mon] || mon;
  return `${fullMonth} 20${year}`;
};

// Generate mockMandanten from mandantenData for KanzleiCockpit compatibility
export const mockMandanten = mandantenData.map(m => ({
  id: m.id,
  name: m.clientName,
  month: monthLabelToFull(m.monthLabel),
  transactionCount: Math.floor(Math.random() * 200) + 50, // Simulated
  documentCount: Math.floor(Math.random() * 150) + 30, // Simulated
  matchedConfident: Math.floor(Math.random() * 100) + 20, // Simulated
  matchedUncertain: m.unsureCount,
  missingReceipt: m.missingCount,
  hasRiskFlag: m.riskFlag,
  lastActivity: m.lastActivityAt.split('T')[0], // Date only
}));
