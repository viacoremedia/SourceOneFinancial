import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AnalyticsContextType {
  focusedDealerId: string | null;
  focusedDealerName: string | null;
  focusedRep: string | null;
  focusedMonth: string | null;
  focusedStatus: string | null;
  focusedVisitDate: string | null;
  dealer360Open: boolean;
  dealer360InitialTab: 'overview' | 'timeline' | 'mom' | 'touchpoints' | 'apps';
  
  openDealer360: (
    dealerId: string,
    dealerName?: string | null,
    initialTab?: 'overview' | 'timeline' | 'mom' | 'touchpoints' | 'apps',
    focusVisitDate?: string | null
  ) => void;
  closeDealer360: () => void;
  setFocusedRep: (repName: string | null) => void;
  setFocusedMonth: (month: string | null) => void;
  setFocusedStatus: (status: string | null) => void;
  clearFocus: () => void;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [focusedDealerId, setFocusedDealerId] = useState<string | null>(null);
  const [focusedDealerName, setFocusedDealerName] = useState<string | null>(null);
  const [focusedRep, setFocusedRep] = useState<string | null>(null);
  const [focusedMonth, setFocusedMonth] = useState<string | null>(null);
  const [focusedStatus, setFocusedStatus] = useState<string | null>(null);
  const [focusedVisitDate, setFocusedVisitDate] = useState<string | null>(null);
  
  const [dealer360Open, setDealer360Open] = useState<boolean>(false);
  const [dealer360InitialTab, setDealer360InitialTab] = useState<'overview' | 'timeline' | 'mom' | 'touchpoints' | 'apps'>('overview');

  const openDealer360 = useCallback((
    dealerId: string,
    dealerName?: string | null,
    initialTab: 'overview' | 'timeline' | 'mom' | 'touchpoints' | 'apps' = 'overview',
    focusVisitDate?: string | null
  ) => {
    setFocusedDealerId(dealerId);
    if (dealerName) setFocusedDealerName(dealerName);
    setDealer360InitialTab(initialTab);
    setFocusedVisitDate(focusVisitDate || null);
    setDealer360Open(true);
  }, []);

  const closeDealer360 = useCallback(() => {
    setDealer360Open(false);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedDealerId(null);
    setFocusedDealerName(null);
    setFocusedRep(null);
    setFocusedMonth(null);
    setFocusedStatus(null);
    setFocusedVisitDate(null);
    setDealer360Open(false);
  }, []);

  return (
    <AnalyticsContext.Provider
      value={{
        focusedDealerId,
        focusedDealerName,
        focusedRep,
        focusedMonth,
        focusedStatus,
        focusedVisitDate,
        dealer360Open,
        dealer360InitialTab,
        openDealer360,
        closeDealer360,
        setFocusedRep,
        setFocusedMonth,
        setFocusedStatus,
        clearFocus,
      }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalyticsContext must be used within an AnalyticsProvider');
  }
  return context;
}
