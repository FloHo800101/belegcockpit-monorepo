// SFA Mock Data for Cluster Workbench
import { 
  SfaCase, 
  SfaQueueId, 
  SfaTriggerReason, 
  SfaMandantStatus,
  SfaCaseStatus,
  PaymentMethod,
  AuditEntry 
} from '@/data/types';
import { generateDeterministicPurpose } from '@/data/purposeGenerator';

// Merchant data with payment methods
const MERCHANTS: Array<{ name: string; paymentMethod: PaymentMethod; direction: 'in' | 'out' }> = [
  { name: 'Telekom Deutschland GmbH', paymentMethod: 'Bank', direction: 'out' },
  { name: 'Vodafone GmbH', paymentMethod: 'Bank', direction: 'out' },
  { name: 'MICROSOFT 365', paymentMethod: 'Card', direction: 'out' },
  { name: 'ADOBE *SUBSCRIPTION', paymentMethod: 'Card', direction: 'out' },
  { name: 'GOOGLE *STORAGE', paymentMethod: 'Card', direction: 'out' },
  { name: 'Dell GmbH', paymentMethod: 'Bank', direction: 'out' },
  { name: 'BAUHAUS', paymentMethod: 'Card', direction: 'out' },
  { name: 'MEDIAMARKT', paymentMethod: 'Card', direction: 'out' },
  { name: 'HORNBACH', paymentMethod: 'Card', direction: 'out' },
  { name: 'CONRAD', paymentMethod: 'Card', direction: 'out' },
  { name: 'AMAZON EU SARL', paymentMethod: 'Card', direction: 'out' },
  { name: 'AMAZON MARKETPLACE', paymentMethod: 'PayPal', direction: 'out' },
  { name: 'EBAY SETTLEMENT', paymentMethod: 'PayPal', direction: 'in' },
  { name: 'PAYPAL SETTLEMENT', paymentMethod: 'PayPal', direction: 'in' },
  { name: 'PAYPAL *SHOP-XYZ', paymentMethod: 'PayPal', direction: 'out' },
  { name: 'STROMVERSORGER ABC', paymentMethod: 'Bank', direction: 'out' },
  { name: 'BANKGEBUEHR KONTO', paymentMethod: 'Bank', direction: 'out' },
  { name: 'PARKAUTOMAT PINNEBERG', paymentMethod: 'Card', direction: 'out' },
  { name: 'PARKAUTOMAT HAMBURG', paymentMethod: 'Card', direction: 'out' },
  { name: 'DB BAHN ONLINE-TICKET', paymentMethod: 'Card', direction: 'out' },
  { name: 'CAFE ALSTER', paymentMethod: 'Card', direction: 'out' },
  { name: 'HOTEL HAMBURG', paymentMethod: 'Card', direction: 'out' },
  { name: 'COPYSHOP PINNEBERG', paymentMethod: 'Card', direction: 'out' },
  { name: 'PAYMENT PROVIDER SETTLEMENT', paymentMethod: 'Stripe', direction: 'in' },
];

// Generate deterministic pseudo-random number from seed
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Generate a date in January 2026
function generateDate(seed: number, dayOffset: number = 0): string {
  const day = Math.min(31, Math.max(1, (seed % 28) + 1 + dayOffset));
  return `2026-01-${day.toString().padStart(2, '0')}`;
}

// Generate audit trail for a case
function generateAuditTrail(caseId: string, mandantStatus: SfaMandantStatus, caseStatus: SfaCaseStatus, seed: number): AuditEntry[] {
  const rand = seededRandom(seed);
  const entries: AuditEntry[] = [];
  
  // Initial entry - always present
  const initialDay = Math.floor(rand() * 10) + 1;
  entries.push({
    at: `2026-01-${initialDay.toString().padStart(2, '0')}T09:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
    actor: 'mandant',
    action: 'Fall erstellt',
  });
  
  // Status-based entries
  if (mandantStatus === 'handed_over') {
    entries.push({
      at: `2026-01-${(initialDay + 2).toString().padStart(2, '0')}T14:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
      actor: 'mandant',
      action: 'An Kanzlei übergeben',
      note: rand() > 0.5 ? 'Bitte prüfen' : undefined,
    });
  } else if (mandantStatus === 'rejected_match') {
    entries.push({
      at: `2026-01-${(initialDay + 1).toString().padStart(2, '0')}T11:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
      actor: 'mandant',
      action: 'Zuordnung abgelehnt',
      note: 'Beleg gehört nicht zu dieser Zahlung',
    });
  } else if (mandantStatus === 'uploaded_receipt') {
    entries.push({
      at: `2026-01-${(initialDay + 1).toString().padStart(2, '0')}T10:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
      actor: 'mandant',
      action: 'Beleg hochgeladen',
    });
  } else if (mandantStatus === 'marked_private') {
    entries.push({
      at: `2026-01-${(initialDay + 1).toString().padStart(2, '0')}T16:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
      actor: 'mandant',
      action: 'Privat markiert',
    });
  }
  
  // SFA entry if waiting
  if (caseStatus === 'waiting_mandant') {
    entries.push({
      at: `2026-01-${(initialDay + 3).toString().padStart(2, '0')}T09:${(rand() * 60 | 0).toString().padStart(2, '0')}:00.000Z`,
      actor: 'sfa',
      action: 'Rückfrage hinzugefügt',
      note: 'Bitte Beleg nachreichen oder erklären',
    });
  }
  
  return entries;
}

// Queue-specific case generation
interface QueueConfig {
  triggerReasons: SfaTriggerReason[];
  mandantStatuses: SfaMandantStatus[];
  amountRange: [number, number];
  hasReceipt: boolean;
}

const QUEUE_CONFIGS: Record<SfaQueueId, QueueConfig> = {
  missing_receipts: {
    triggerReasons: [],
    mandantStatuses: ['handed_over', 'uploaded_receipt'],
    amountRange: [50, 5000],
    hasReceipt: false,
  },
  clarify_matching: {
    triggerReasons: ['ambiguous', 'amount_deviation', 'date_deviation'],
    mandantStatuses: ['handed_over', 'rejected_match'],
    amountRange: [100, 3000],
    hasReceipt: true,
  },
  tax_risks: {
    triggerReasons: ['fee_uncertain', 'amount_deviation'],
    mandantStatuses: ['handed_over'],
    amountRange: [500, 10000],
    hasReceipt: true,
  },
  duplicates_corrections: {
    triggerReasons: ['ambiguous'],
    mandantStatuses: ['handed_over', 'rejected_match'],
    amountRange: [200, 2000],
    hasReceipt: true,
  },
  fees_misc: {
    triggerReasons: ['fee_uncertain'],
    mandantStatuses: ['handed_over'],
    amountRange: [5, 100],
    hasReceipt: false,
  },
};

// Generate cases for a specific queue
export function generateSfaCases(queueId: SfaQueueId, count: number = 12): SfaCase[] {
  const config = QUEUE_CONFIGS[queueId];
  const cases: SfaCase[] = [];
  
  for (let i = 0; i < count; i++) {
    const seed = queueId.charCodeAt(0) * 1000 + i * 137;
    const rand = seededRandom(seed);
    
    const merchantIndex = Math.floor(rand() * MERCHANTS.length);
    const merchant = MERCHANTS[merchantIndex];
    
    const id = `${queueId}-case-${i + 1}`;
    const date = generateDate(seed, i % 15);
    
    // Amount within range
    const [minAmount, maxAmount] = config.amountRange;
    const amount = Math.round((minAmount + rand() * (maxAmount - minAmount)) * 100) / 100;
    
    // Mandant status
    const mandantStatus = config.mandantStatuses[Math.floor(rand() * config.mandantStatuses.length)];
    
    // Case status - ensure at least 3 waiting cases per queue
    let caseStatus: SfaCaseStatus = 'open';
    if (i < 3) {
      caseStatus = 'waiting_mandant';
    } else if (rand() > 0.7) {
      caseStatus = 'done';
    }
    
    // Waiting since (for waiting cases)
    let waitingSince: string | undefined;
    if (caseStatus === 'waiting_mandant') {
      const daysAgo = Math.floor(rand() * 7) + 1;
      const waitDate = new Date('2026-01-20');
      waitDate.setDate(waitDate.getDate() - daysAgo);
      waitingSince = waitDate.toISOString();
    }
    
    // Trigger reasons
    const triggerReasons: SfaTriggerReason[] = [];
    if (config.triggerReasons.length > 0) {
      const numReasons = Math.floor(rand() * 2) + 1;
      const shuffled = [...config.triggerReasons].sort(() => rand() - 0.5);
      triggerReasons.push(...shuffled.slice(0, numReasons));
    }
    
    // Confidence (lower for clarify_matching)
    let confidence: number | undefined;
    if (queueId === 'clarify_matching' || queueId === 'duplicates_corrections') {
      confidence = Math.round((rand() * 40 + 30)); // 30-70%
    } else if (config.hasReceipt) {
      confidence = Math.round((rand() * 30 + 60)); // 60-90%
    }
    
    // Receipt if applicable
    let receipt = null;
    if (config.hasReceipt && rand() > 0.3) {
      const receiptAmountDiff = triggerReasons.includes('amount_deviation') 
        ? (rand() > 0.5 ? 1 : -1) * (rand() * 50 + 5)
        : 0;
      receipt = {
        id: `receipt-${id}`,
        fileName: `Rechnung_${merchant.name.replace(/\s/g, '_').substring(0, 15)}_${date}.pdf`,
        date: date,
        amount: Math.round((amount + receiptAmountDiff) * 100) / 100,
      };
    }
    
    // Generate realistic purpose
    const purpose = generateDeterministicPurpose(id, merchant.name, merchant.paymentMethod, date);
    
    // Generate audit trail
    const auditTrail = generateAuditTrail(id, mandantStatus, caseStatus, seed);
    
    cases.push({
      id,
      date,
      amount,
      direction: merchant.direction,
      counterparty: merchant.name,
      purpose,
      paymentMethod: merchant.paymentMethod,
      mandantStatus,
      caseStatus,
      waitingSince,
      confidence,
      triggerReasons,
      receipt,
      auditTrail,
    });
  }
  
  // Sort by default: high amount, then low confidence, then waiting since
  return cases.sort((a, b) => {
    // High amount first
    if (Math.abs(b.amount) !== Math.abs(a.amount)) {
      return Math.abs(b.amount) - Math.abs(a.amount);
    }
    // Lower confidence first
    if ((a.confidence ?? 100) !== (b.confidence ?? 100)) {
      return (a.confidence ?? 100) - (b.confidence ?? 100);
    }
    // Older waiting first
    if (a.waitingSince && b.waitingSince) {
      return new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime();
    }
    if (a.waitingSince) return -1;
    if (b.waitingSince) return 1;
    return 0;
  });
}

// Get all cases for a mandant/month (combines all queues)
export function getAllSfaCases(): Record<SfaQueueId, SfaCase[]> {
  return {
    missing_receipts: generateSfaCases('missing_receipts', 12),
    clarify_matching: generateSfaCases('clarify_matching', 10),
    tax_risks: generateSfaCases('tax_risks', 8),
    duplicates_corrections: generateSfaCases('duplicates_corrections', 6),
    fees_misc: generateSfaCases('fees_misc', 15),
  };
}