// Rückfragenpaket Store
// Context-based store for managing inquiry packages (SFA → Mandant)
// Extended with month status tracking for internal closing

import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { InquiryPackageItem, AuditEntry } from '@/data/types';

export type MonthStatus = 'in_progress' | 'closed_internal';

interface InquiryPackageState {
  mandantId: string | null;
  monthId: string | null;
  items: InquiryPackageItem[];
  // Month status tracking
  monthStatuses: Record<string, MonthStatus>;
  monthAuditLogs: Record<string, AuditEntry[]>;
}

type InquiryPackageAction =
  | { type: 'SET_CONTEXT'; mandantId: string; monthId: string }
  | { type: 'ADD_ITEM'; caseId: string; questionText: string }
  | { type: 'REMOVE_ITEM'; caseId: string }
  | { type: 'UPDATE_ITEM'; caseId: string; questionText: string }
  | { type: 'CLEAR_PACKAGE' }
  | { type: 'SET_MONTH_STATUS'; key: string; status: MonthStatus }
  | { type: 'ADD_MONTH_AUDIT'; key: string; entry: AuditEntry };

const initialState: InquiryPackageState = {
  mandantId: null,
  monthId: null,
  items: [],
  monthStatuses: {},
  monthAuditLogs: {},
};

function inquiryPackageReducer(
  state: InquiryPackageState,
  action: InquiryPackageAction
): InquiryPackageState {
  switch (action.type) {
    case 'SET_CONTEXT':
      // Clear items if context changes
      if (state.mandantId !== action.mandantId || state.monthId !== action.monthId) {
        return {
          ...state,
          mandantId: action.mandantId,
          monthId: action.monthId,
          items: [],
        };
      }
      return state;

    case 'ADD_ITEM':
      // Don't add duplicates
      if (state.items.some(item => item.caseId === action.caseId)) {
        return state;
      }
      return {
        ...state,
        items: [...state.items, { caseId: action.caseId, questionText: action.questionText }],
      };

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.caseId !== action.caseId),
      };

    case 'UPDATE_ITEM':
      return {
        ...state,
        items: state.items.map(item =>
          item.caseId === action.caseId
            ? { ...item, questionText: action.questionText }
            : item
        ),
      };

    case 'CLEAR_PACKAGE':
      return {
        ...state,
        items: [],
      };

    case 'SET_MONTH_STATUS':
      return {
        ...state,
        monthStatuses: {
          ...state.monthStatuses,
          [action.key]: action.status,
        },
      };

    case 'ADD_MONTH_AUDIT':
      return {
        ...state,
        monthAuditLogs: {
          ...state.monthAuditLogs,
          [action.key]: [...(state.monthAuditLogs[action.key] || []), action.entry],
        },
      };

    default:
      return state;
  }
}

interface InquiryPackageContextType {
  state: InquiryPackageState;
  setContext: (mandantId: string, monthId: string) => void;
  addItem: (caseId: string, questionText: string) => void;
  removeItem: (caseId: string) => void;
  updateItem: (caseId: string, questionText: string) => void;
  clearPackage: () => void;
  hasItem: (caseId: string) => boolean;
  getItemCount: () => number;
  generateEmailText: (getCaseDetails: (caseId: string) => { counterparty: string; amount: number; date: string } | null) => string;
  // Month status functions
  getMonthStatus: (mandantId: string, monthId: string) => MonthStatus;
  setMonthStatus: (mandantId: string, monthId: string, status: MonthStatus) => void;
  addMonthAudit: (mandantId: string, monthId: string, entry: AuditEntry) => void;
  getMonthAuditLogs: (mandantId: string, monthId: string) => AuditEntry[];
}

const InquiryPackageContext = createContext<InquiryPackageContextType | null>(null);

export function InquiryPackageProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(inquiryPackageReducer, initialState);

  const setContext = (mandantId: string, monthId: string) => {
    dispatch({ type: 'SET_CONTEXT', mandantId, monthId });
  };

  const addItem = (caseId: string, questionText: string) => {
    dispatch({ type: 'ADD_ITEM', caseId, questionText });
  };

  const removeItem = (caseId: string) => {
    dispatch({ type: 'REMOVE_ITEM', caseId });
  };

  const updateItem = (caseId: string, questionText: string) => {
    dispatch({ type: 'UPDATE_ITEM', caseId, questionText });
  };

  const clearPackage = () => {
    dispatch({ type: 'CLEAR_PACKAGE' });
  };

  const hasItem = (caseId: string) => {
    return state.items.some(item => item.caseId === caseId);
  };

  const getItemCount = () => {
    return state.items.length;
  };

  // Generate formatted email text for copy & paste
  const generateEmailText = (
    getCaseDetails: (caseId: string) => { counterparty: string; amount: number; date: string } | null
  ): string => {
    if (state.items.length === 0) return '';

    const formatCurrency = (amount: number) =>
      new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);

    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    let text = `Rückfragen zu Ihren Buchungen (${state.monthId})\n`;
    text += '='.repeat(50) + '\n\n';
    text += `Sehr geehrte Damen und Herren,\n\n`;
    text += `zu folgenden Buchungen benötigen wir noch Ihre Rückmeldung:\n\n`;

    state.items.forEach((item, index) => {
      const details = getCaseDetails(item.caseId);
      if (details) {
        text += `${index + 1}. ${details.counterparty}\n`;
        text += `   Datum: ${formatDate(details.date)} | Betrag: ${formatCurrency(details.amount)}\n`;
        text += `   Frage: ${item.questionText}\n\n`;
      }
    });

    text += `Bitte antworten Sie auf diese E-Mail mit Ihren Erläuterungen.\n\n`;
    text += `Mit freundlichen Grüßen\n`;
    text += `Ihre Kanzlei`;

    return text;
  };

  // Month status functions
  const getMonthStatus = (mandantId: string, monthId: string): MonthStatus => {
    const key = `${mandantId}-${monthId}`;
    return state.monthStatuses[key] || 'in_progress';
  };

  const setMonthStatusFn = (mandantId: string, monthId: string, status: MonthStatus) => {
    const key = `${mandantId}-${monthId}`;
    dispatch({ type: 'SET_MONTH_STATUS', key, status });
  };

  const addMonthAudit = (mandantId: string, monthId: string, entry: AuditEntry) => {
    const key = `${mandantId}-${monthId}`;
    dispatch({ type: 'ADD_MONTH_AUDIT', key, entry });
  };

  const getMonthAuditLogs = (mandantId: string, monthId: string): AuditEntry[] => {
    const key = `${mandantId}-${monthId}`;
    return state.monthAuditLogs[key] || [];
  };

  return (
    <InquiryPackageContext.Provider
      value={{
        state,
        setContext,
        addItem,
        removeItem,
        updateItem,
        clearPackage,
        hasItem,
        getItemCount,
        generateEmailText,
        getMonthStatus,
        setMonthStatus: setMonthStatusFn,
        addMonthAudit,
        getMonthAuditLogs,
      }}
    >
      {children}
    </InquiryPackageContext.Provider>
  );
}

export function useInquiryPackage() {
  const context = useContext(InquiryPackageContext);
  if (!context) {
    throw new Error('useInquiryPackage must be used within an InquiryPackageProvider');
  }
  return context;
}