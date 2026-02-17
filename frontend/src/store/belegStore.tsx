// BelegCockpit State Store using React Context + useReducer
import { createContext, useContext, useReducer, ReactNode } from 'react';
import { Transaction, Document, TransactionStatus, MandantPackageKey, KanzleiCluster, RISK_BASE_SCORES } from '@/data/types';
import { initialTransactions, initialDocuments } from '@/data/mockData';

// Wizard setup state
interface WizardSetupState {
  selectedMonth: string;
  uploadedKontoauszug: boolean;
  uploadedKreditkarte: boolean;
  uploadedBelege: boolean;
  matchingComplete: boolean;
}

// State interface
interface BelegState {
  transactions: Transaction[];
  documents: Document[];
  selectedMonth: string;
  wizardSetup: WizardSetupState;
}

// Action types
type BelegAction =
  | { type: 'UPDATE_TRANSACTION_STATUS'; payload: { id: string; status: TransactionStatus; mandantPackageKey?: MandantPackageKey } }
  | { type: 'UPDATE_DOCUMENT_QUALITY'; payload: { id: string; quality: 'ok' | 'bad_photo' } }
  | { type: 'UPLOAD_RECEIPT'; payload: { transactionId: string } }
  | { type: 'SET_MONTH'; payload: string }
  | { type: 'BULK_UPDATE_STATUS'; payload: { ids: string[]; status: TransactionStatus } }
  | { type: 'WIZARD_SET_MONTH'; payload: string }
  | { type: 'WIZARD_UPLOAD_KONTOAUSZUG' }
  | { type: 'WIZARD_UPLOAD_KREDITKARTE' }
  | { type: 'WIZARD_UPLOAD_BELEGE' }
  | { type: 'WIZARD_COMPLETE_MATCHING' }
  | { type: 'WIZARD_RESET' };

// Initial state
const initialState: BelegState = {
  transactions: initialTransactions,
  documents: initialDocuments,
  selectedMonth: 'Januar 2026',
  wizardSetup: {
    selectedMonth: '',
    uploadedKontoauszug: false,
    uploadedKreditkarte: false,
    uploadedBelege: false,
    matchingComplete: false
  }
};

// Reducer
function belegReducer(state: BelegState, action: BelegAction): BelegState {
  switch (action.type) {
    case 'UPDATE_TRANSACTION_STATUS':
      return {
        ...state,
        transactions: state.transactions.map(tx =>
          tx.id === action.payload.id
            ? {
                ...tx,
                status: action.payload.status,
                mandantPackageKey: action.payload.mandantPackageKey ?? tx.mandantPackageKey
              }
            : tx
        )
      };
    
    case 'UPDATE_DOCUMENT_QUALITY':
      return {
        ...state,
        documents: state.documents.map(doc =>
          doc.id === action.payload.id
            ? { ...doc, quality: action.payload.quality }
            : doc
        )
      };
    
    case 'UPLOAD_RECEIPT':
      // Fixed: Uploading a receipt sets status to matched_uncertain
      return {
        ...state,
        transactions: state.transactions.map(tx =>
          tx.id === action.payload.transactionId
            ? { ...tx, status: 'matched_uncertain' as TransactionStatus }
            : tx
        )
      };
    
    case 'SET_MONTH':
      return { ...state, selectedMonth: action.payload };
    
    case 'BULK_UPDATE_STATUS':
      return {
        ...state,
        transactions: state.transactions.map(tx =>
          action.payload.ids.includes(tx.id)
            ? { ...tx, status: action.payload.status }
            : tx
        )
      };
    
    case 'WIZARD_SET_MONTH':
      return {
        ...state,
        wizardSetup: { ...state.wizardSetup, selectedMonth: action.payload }
      };
    
    case 'WIZARD_UPLOAD_KONTOAUSZUG':
      return {
        ...state,
        wizardSetup: { ...state.wizardSetup, uploadedKontoauszug: true }
      };
    
    case 'WIZARD_UPLOAD_KREDITKARTE':
      return {
        ...state,
        wizardSetup: { ...state.wizardSetup, uploadedKreditkarte: true }
      };
    
    case 'WIZARD_UPLOAD_BELEGE':
      return {
        ...state,
        wizardSetup: { ...state.wizardSetup, uploadedBelege: true }
      };
    
    case 'WIZARD_COMPLETE_MATCHING':
      return {
        ...state,
        wizardSetup: { ...state.wizardSetup, matchingComplete: true }
      };
    
    case 'WIZARD_RESET':
      return {
        ...state,
        wizardSetup: {
          selectedMonth: '',
          uploadedKontoauszug: false,
          uploadedKreditkarte: false,
          uploadedBelege: false,
          matchingComplete: false
        }
      };
    
    default:
      return state;
  }
}

// Context
interface BelegContextType {
  state: BelegState;
  dispatch: React.Dispatch<BelegAction>;
  
  // Computed values
  counts: {
    total: number;
    confident: number;
    uncertain: number;
    missing: number;
    resolved: number;
  };
  
  // Mandant package counts
  packageCounts: Record<string, number>;
  
  // Kanzlei cluster counts
  clusterCounts: Record<KanzleiCluster, number>;
  
  // KPI counts
  kpiCounts: {
    autoOk: number;
    autoRequest: number;
    needsHuman: number;
    riskQueue: number;
  };
  
  // Top 5 missing by amount
  top5Missing: Transaction[];
  
  // Risk queue (top 20 by risk score)
  riskQueue: Transaction[];
  
  // Bad photo documents
  badPhotoDocuments: Document[];
  
  // Wizard setup state
  wizardSetup: WizardSetupState;
  
  // Helpers
  getTransactionsByPackage: (packageKey: MandantPackageKey) => Transaction[];
  getTransactionsByCluster: (cluster: KanzleiCluster) => Transaction[];
  getUncertainTransactions: () => Transaction[];
  getDocumentById: (id: string) => Document | undefined;
  getMerchantsByPackage: (packageKey: MandantPackageKey) => { merchant: string; count: number }[];
  getDocumentForTransaction: (transactionId: string) => Document | undefined;
}

const BelegContext = createContext<BelegContextType | null>(null);

// Provider component
export function BelegProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(belegReducer, initialState);
  
  // Compute counts
  const counts = {
    total: state.transactions.length,
    confident: state.transactions.filter(t => t.status === 'matched_confident').length,
    uncertain: state.transactions.filter(t => t.status === 'matched_uncertain').length,
    missing: state.transactions.filter(t => t.status === 'missing_receipt').length,
    resolved: state.transactions.filter(t => 
      t.status === 'resolved_no_receipt' || 
      t.status === 'resolved_self_receipt' || 
      t.status === 'resolved_private'
    ).length
  };
  
  // Package counts (only missing_receipt)
  const packageCounts: Record<string, number> = {
    monthly_invoices: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'monthly_invoices'
    ).length,
    marketplace_statement: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'marketplace_statement'
    ).length,
    small_no_receipt: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'small_no_receipt'
    ).length,
    top_amounts: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'top_amounts'
    ).length,
    other_open: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'other_open'
    ).length,
    bundles: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'bundles'
    ).length,
    subscriptions: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'subscriptions'
    ).length,
    refunds: state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === 'refunds'
    ).length
  };

  // Bad photo documents
  const badPhotoDocuments = state.documents.filter(d => d.quality === 'bad_photo');
  
  // Cluster counts
  const clusterCounts = {} as Record<KanzleiCluster, number>;
  const clusters: KanzleiCluster[] = [
    'missing', 'many_to_one', 'one_to_many', 'duplicate_risk', 'amount_variance',
    'timing', 'vendor_unknown', 'tax_risk', 'fees', 'anomaly', 'refund_reversal'
  ];
  clusters.forEach(cluster => {
    clusterCounts[cluster] = state.transactions.filter(t => t.kanzleiClusterPrimary === cluster).length;
  });
  
  // KPI counts based on fixed cluster assignments
  const autoOkClusters: KanzleiCluster[] = ['fees', 'timing', 'refund_reversal'];
  const autoRequestClusters: KanzleiCluster[] = ['missing', 'many_to_one'];
  const needsHumanClusters: KanzleiCluster[] = ['duplicate_risk', 'amount_variance', 'vendor_unknown', 'tax_risk', 'anomaly', 'one_to_many'];
  
  const kpiCounts = {
    autoOk: state.transactions.filter(t => autoOkClusters.includes(t.kanzleiClusterPrimary)).length,
    autoRequest: state.transactions.filter(t => autoRequestClusters.includes(t.kanzleiClusterPrimary)).length,
    needsHuman: state.transactions.filter(t => needsHumanClusters.includes(t.kanzleiClusterPrimary)).length,
    riskQueue: 20 // Fixed top 20
  };
  
  // Top 5 missing by absolute amount
  const top5Missing = state.transactions
    .filter(t => t.status === 'missing_receipt')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 5);
  
  // Risk queue: top 20 by risk score
  const calculateRiskScore = (tx: Transaction): number => {
    const baseScore = RISK_BASE_SCORES[tx.kanzleiClusterPrimary] || 10;
    const amountScore = Math.min(40, Math.abs(tx.amount) / 50);
    return baseScore + amountScore;
  };
  
  const riskQueue = [...state.transactions]
    .map(tx => ({ ...tx, riskScore: calculateRiskScore(tx) }))
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 20);
  
  // Helper functions
  const getTransactionsByPackage = (packageKey: MandantPackageKey): Transaction[] => {
    return state.transactions.filter(t => 
      t.status === 'missing_receipt' && t.mandantPackageKey === packageKey
    );
  };
  
  const getTransactionsByCluster = (cluster: KanzleiCluster): Transaction[] => {
    return state.transactions.filter(t => t.kanzleiClusterPrimary === cluster);
  };
  
  const getUncertainTransactions = (): Transaction[] => {
    return state.transactions.filter(t => t.status === 'matched_uncertain');
  };
  
  const getDocumentById = (id: string): Document | undefined => {
    return state.documents.find(d => d.id === id);
  };
  
  const getMerchantsByPackage = (packageKey: MandantPackageKey): { merchant: string; count: number }[] => {
    const txs = getTransactionsByPackage(packageKey);
    const merchantMap = new Map<string, number>();
    txs.forEach(tx => {
      merchantMap.set(tx.merchant, (merchantMap.get(tx.merchant) || 0) + 1);
    });
    return Array.from(merchantMap.entries())
      .map(([merchant, count]) => ({ merchant, count }))
      .sort((a, b) => b.count - a.count);
  };
  
  const getDocumentForTransaction = (transactionId: string): Document | undefined => {
    return state.documents.find(d => d.linkedTransactionId === transactionId);
  };
  
  const value: BelegContextType = {
    state,
    dispatch,
    counts,
    packageCounts,
    clusterCounts,
    kpiCounts,
    top5Missing,
    riskQueue,
    badPhotoDocuments,
    wizardSetup: state.wizardSetup,
    getTransactionsByPackage,
    getTransactionsByCluster,
    getUncertainTransactions,
    getDocumentById,
    getMerchantsByPackage,
    getDocumentForTransaction
  };
  
  return (
    <BelegContext.Provider value={value}>
      {children}
    </BelegContext.Provider>
  );
}

// Custom hook
export function useBelegStore() {
  const context = useContext(BelegContext);
  if (!context) {
    throw new Error('useBelegStore must be used within a BelegProvider');
  }
  return context;
}
