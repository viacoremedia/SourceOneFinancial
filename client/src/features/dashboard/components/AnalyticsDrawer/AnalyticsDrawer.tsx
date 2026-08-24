import { useEffect, useState, useMemo, useRef } from 'react';
import {
  getHistoricalMoM,
  getDealerApplicationsHistory,
  searchDealers,
  getRepCommunicationHistory,
  getUnderwriterScorecardApi,
  getDealerRelationshipDrawer,
  overrideDealerRelationshipSegment,
  resetDealerRelationshipOverride
} from '../../../../core/services/api';
import type {
  RepMappings,
  RepCommunicationHistoryResponse,
  RelationshipDemandDrawerResponse
} from '../../../../core/services/api';
import type {
  HistoricalMoMItem,
  HistoricalMoMResponse,
  MetricTrend,
  DealerApplicationHistoryResponse,
  ApplicationHistoryItem
} from '../../types';
import { useAuth } from '../../../auth/hooks/useAuth';
import {
  X,
  TrendingUp,
  FileText,
  MessageSquare,
  Activity,
  ShieldCheck,
  UserCheck,
  AlertTriangle,
  Calendar,
  Lock,
  Unlock,
  History
} from 'lucide-react';
import { ApplicationDetailDrawer } from '../ApplicationDetailDrawer/ApplicationDetailDrawer';
import { CommunicationDetailModal, type CommunicationDetailItem } from '../../../../components/CommunicationDetailModal/CommunicationDetailModal';
import styles from './AnalyticsDrawer.module.css';

interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  availableStates?: string[];
  availableGroups?: { name: string; slug: string }[];
  repMappings?: RepMappings | null;
  repStatesMap?: Record<string, string[]>;
  initialDealerId?: string | null;
  initialGroupSlug?: string | null;
  initialUnderwriter?: string | null;
  initialStartDate?: string | null;
  initialEndDate?: string | null;
  initialDatePreset?: string | null;
  initialTab?: 'drd' | 'mom' | 'applications' | 'communications';
  tableRowData?: any | null;
  comparisonLabel?: string;
  datePresetLabel?: string;
  dateRangeStr?: string;
  allTableDealers?: any[];
  onSelectDealerId?: (dealerId: string | null) => void;
  onSelectGroupSlug?: (groupSlug: string | null) => void;
}

function formatCurrency(val: number): string {
  if (Math.abs(val) >= 1_000_000) {
    return `$${(val / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(val) >= 1_000) {
    return `$${(val / 1_000).toFixed(1)}k`;
  }
  return `$${val.toLocaleString()}`;
}

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function formatStatValue(val: number | undefined | null, type: 'count' | 'dollar' | 'percent'): string {
  if (val == null) return '—';
  if (val === 0) return type === 'dollar' ? '$0' : type === 'percent' ? '0.0%' : '0';
  if (type === 'dollar') {
    if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
    if (Math.abs(val) >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
    return `$${val.toLocaleString()}`;
  }
  if (type === 'percent') return `${(val * 100).toFixed(1)}%`;
  return val.toLocaleString();
}

function renderBadge(trendObj?: MetricTrend) {
  if (!trendObj) return null;
  const { pct } = trendObj;
  if (pct == null || pct === 0) return null;
  const isUp = pct > 0;
  const trendClass = isUp ? styles.trendUp : styles.trendDown;
  const arrow = isUp ? '↑' : '↓';
  const sign = isUp ? '+' : '';
  return (
    <span className={`${styles.trendTag} ${trendClass}`}>
      {arrow} {sign}{pct}%
    </span>
  );
}

export function AnalyticsDrawer({
  isOpen,
  onClose,
  availableStates = [],
  availableGroups = [],
  repMappings = null,
  repStatesMap = {},
  initialDealerId = null,
  initialGroupSlug = null,
  initialUnderwriter = null,
  initialStartDate = null,
  initialEndDate = null,
  initialDatePreset = null,
  initialTab = 'mom',
  tableRowData = null,
  comparisonLabel,
  datePresetLabel,
  dateRangeStr,
  allTableDealers = [],
  onSelectDealerId,
  onSelectGroupSlug,
}: AnalyticsDrawerProps) {
  const { user } = useAuth();
  const isSuperAdminOrJoshua = Boolean(
    user?.role === 'super_admin' ||
    (user?.role as string) === 'superadmin' ||
    user?.email?.trim().toLowerCase() === 'joshua@viacoremedia.com'
  );

  // Active Tab: 'drd' | 'mom' | 'applications' | 'communications'
  const [activeTab, setActiveTab] = useState<'drd' | 'mom' | 'applications' | 'communications'>(initialTab);

  // Selected Dealer Filter (ID or Mongo _id)
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(initialDealerId);
  const [selectedUnderwriter, setSelectedUnderwriter] = useState<string>(initialUnderwriter || '');
  const [appStartDate, setAppStartDate] = useState<string>(initialStartDate || '');
  const [appEndDate, setAppEndDate] = useState<string>(initialEndDate || '');
  const [appDatePreset, setAppDatePreset] = useState<string>(initialDatePreset || 'all');
  const [underwriterList, setUnderwriterList] = useState<string[]>([]);
  const [selectedDealerObj, setSelectedDealerObj] = useState<{
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix: string;
  } | null>(null);

  // DRD Profile State
  const [drdData, setDrdData] = useState<RelationshipDemandDrawerResponse | null>(null);
  const [drdLoading, setDrdLoading] = useState<boolean>(false);
  const [drdError, setDrdError] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<any | null>(null);

  // DRD Manual Override & Reconciliation State
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideSegment, setOverrideSegment] = useState<'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'insufficient_data'>('high_tlc');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideActionError, setOverrideActionError] = useState<string | null>(null);
  const [showAuditHistory, setShowAuditHistory] = useState(false);

  // Search dropdown state for dealers
  const [dealerSearchOpen, setDealerSearchOpen] = useState(false);
  const [dealerSearchQuery, setDealerSearchQuery] = useState('');
  const [dealerSearchResults, setDealerSearchResults] = useState<Array<{
    _id: string;
    dealerName: string;
    dealerId: string;
    clientDealerId: string;
    statePrefix: string;
  }>>([]);

  // Historical MoM State
  const [data, setData] = useState<HistoricalMoMResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [trendMode, setTrendMode] = useState<'mom' | 'yoy'>('mom');
  const [timeframeMode, setTimeframeMode] = useState<'all' | 'ytd'>('all');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>(initialGroupSlug || '');

  // Application History State
  const [appHistoryData, setAppHistoryData] = useState<DealerApplicationHistoryResponse | null>(null);
  const [appHistoryLoading, setAppHistoryLoading] = useState(false);
  const [appHistoryPage, setAppHistoryPage] = useState(1);

  // Communication History State
  const [commHistoryData, setCommHistoryData] = useState<RepCommunicationHistoryResponse | null>(null);
  const [commHistoryLoading, setCommHistoryLoading] = useState(false);
  const [commHistoryPage, setCommHistoryPage] = useState(1);
  const [commTypeFilter, setCommTypeFilter] = useState<'all' | 'visit' | 'call' | 'email'>('all');

  // Application Detail Drawer State
  const [selectedAppDetail, setSelectedAppDetail] = useState<ApplicationHistoryItem | null>(null);
  const [selectedCommDetail, setSelectedCommDetail] = useState<CommunicationDetailItem | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch underwriter list for filter dropdown
  useEffect(() => {
    if (isOpen) {
      getUnderwriterScorecardApi()
        .then((res) => {
          if (res?.underwriters) {
            const list = res.underwriters.map((u: any) => u.underwriter).filter(Boolean).sort();
            setUnderwriterList(list);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Sync initial props whenever drawer opens or props change
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSelectedDealerId(initialDealerId);
      if (initialUnderwriter != null) {
        setSelectedUnderwriter(initialUnderwriter);
      }
      if (initialStartDate !== undefined) {
        setAppStartDate(initialStartDate || '');
      }
      if (initialEndDate !== undefined) {
        setAppEndDate(initialEndDate || '');
      }
      if (initialDatePreset) {
        setAppDatePreset(initialDatePreset);
      }
      if (!initialDealerId) {
        setSelectedDealerObj(null);
      }
      setSelectedGroup(initialGroupSlug || '');
      setAppHistoryPage(1);
      setAppHistoryData(null);
      setCommHistoryPage(1);
      setCommHistoryData(null);
    }
  }, [isOpen, initialDealerId, initialGroupSlug, initialUnderwriter, initialStartDate, initialEndDate, initialDatePreset, initialTab]);

  const handleAppDatePresetChange = (preset: string) => {
    setAppDatePreset(preset);
    setAppHistoryPage(1);
    const now = new Date();
    if (preset === 'all') {
      setAppStartDate('');
      setAppEndDate('');
    } else if (preset === 'mtd') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === '30d') {
      const start = new Date(now.getTime() - 30 * 86400 * 1000);
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === '90d') {
      const start = new Date(now.getTime() - 90 * 86400 * 1000);
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'ytd') {
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      setAppStartDate(start.toISOString().split('T')[0]);
      setAppEndDate(now.toISOString().split('T')[0]);
    }
  };

  // Click outside to close dealer search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDealerSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search dealers when query changes
  useEffect(() => {
    if (!dealerSearchOpen) return;
    let active = true;
    const timer = setTimeout(() => {
      searchDealers(dealerSearchQuery, 50).then((res) => {
        if (active && res?.dealers) {
          setDealerSearchResults(res.dealers);
        }
      }).catch(console.error);
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [dealerSearchQuery, dealerSearchOpen]);

  // Load Historical MoM data
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let active = true;
    setIsLoading(true);
    setData(null);
    getHistoricalMoM(
      trendMode,
      selectedState || undefined,
      selectedRep || undefined,
      selectedGroup || undefined,
      selectedDealerId || undefined
    )
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load historical MoM analytics:', err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, trendMode, selectedState, selectedRep, selectedGroup, selectedDealerId]);

  // Load Application History data when target, filters or page changes
  useEffect(() => {
    if (!isOpen) return;
    const targetId = selectedDealerId || selectedGroup || 'all';

    let active = true;
    setAppHistoryLoading(true);

    getDealerApplicationsHistory(
      targetId,
      appHistoryPage,
      15,
      selectedState || undefined,
      selectedRep || undefined,
      selectedGroup || undefined,
      selectedUnderwriter || undefined
    )
      .then((res) => {
        if (active) {
          setAppHistoryData(res);
          if (res.location && selectedDealerId) {
            setSelectedDealerObj(res.location);
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load application history:', err);
      })
      .finally(() => {
        if (active) setAppHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedDealerId, selectedGroup, selectedState, selectedRep, selectedUnderwriter, appHistoryPage]);

  // Load Communication History data when target, filters or page changes
  useEffect(() => {
    if (!isOpen || activeTab !== 'communications') return;

    let active = true;
    setCommHistoryLoading(true);

    getRepCommunicationHistory({
      dealerId: selectedDealerId || undefined,
      groupSlug: selectedGroup || undefined,
      state: selectedState || undefined,
      rep: selectedRep || undefined,
      type: commTypeFilter === 'all' ? undefined : commTypeFilter,
      page: commHistoryPage,
      limit: 15,
    })
      .then((res) => {
        if (active) setCommHistoryData(res);
      })
      .catch((err) => {
        console.error('Failed to load communication history:', err);
      })
      .finally(() => {
        if (active) setCommHistoryLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, activeTab, selectedDealerId, selectedGroup, selectedState, selectedRep, commTypeFilter, commHistoryPage]);

  // Load DRD Profile when a dealer is selected
  useEffect(() => {
    if (!isOpen || !selectedDealerId || selectedDealerId === 'all') {
      setDrdData(null);
      setDrdError(null);
      return;
    }

    let active = true;
    setDrdLoading(true);
    setDrdError(null);

    getDealerRelationshipDrawer(selectedDealerId)
      .then((res) => {
        if (active) {
          setDrdData(res);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load dealer relationship profile:', err);
          setDrdError(err.message || 'Failed to load relationship demand profile');
        }
      })
      .finally(() => {
        if (active) setDrdLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, selectedDealerId]);

  // Rep list
  const repList = useMemo(() => {
    const budgetReps = Object.keys(repStatesMap);
    if (budgetReps.length > 0) return budgetReps.sort();
    if (repMappings?.allReps && repMappings.allReps.length > 0) return repMappings.allReps;
    return ['Bruce', 'George', 'Janet', 'Jeff', 'John', 'Pam/Ward', 'Steve', 'Mandi', 'Tony'];
  }, [repStatesMap, repMappings]);

  // Filtered states
  const filteredStates = useMemo(() => {
    if (selectedRep && repStatesMap[selectedRep]) {
      return [...repStatesMap[selectedRep]].sort();
    }
    return availableStates;
  }, [selectedRep, repStatesMap, availableStates]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (selectedRep && repMappings?.repGroups?.[selectedRep]) {
      return repMappings.repGroups[selectedRep];
    }
    return availableGroups;
  }, [selectedRep, repMappings, availableGroups]);

  // Derived Group Name
  const groupName = useMemo(() => {
    if (!selectedGroup) return null;
    const matched = availableGroups.find((g) => g.slug === selectedGroup);
    return matched ? matched.name : selectedGroup;
  }, [selectedGroup, availableGroups]);

  const handleSelectDealer = (dealer: { _id: string; dealerName: string; dealerId: string; clientDealerId: string; statePrefix: string } | null) => {
    if (!dealer) {
      setSelectedDealerId(null);
      setSelectedDealerObj(null);
      onSelectDealerId?.(null);
      if (activeTab === 'drd') setActiveTab('mom');
    } else {
      setSelectedDealerId(dealer.dealerId || dealer._id || dealer.clientDealerId);
      setSelectedDealerObj(dealer);
      onSelectDealerId?.(dealer.dealerId || dealer._id || dealer.clientDealerId);
      if (isSuperAdminOrJoshua) {
        setActiveTab('drd');
      }
    }
    setDealerSearchOpen(false);
    setAppHistoryPage(1);
    setOverrideModalOpen(false);
    setOverrideReason('');
  };

  const handleSaveOverride = async () => {
    if (!selectedDealerId || selectedDealerId === 'all') return;
    if (!overrideReason.trim() || overrideReason.trim().length < 3) {
      setOverrideActionError('Please provide a mandatory reason note explaining why this dealer is being manually reclassified.');
      return;
    }
    try {
      setOverrideSubmitting(true);
      setOverrideActionError(null);
      await overrideDealerRelationshipSegment(selectedDealerId, overrideSegment, overrideReason.trim());
      const updated = await getDealerRelationshipDrawer(selectedDealerId);
      setDrdData(updated);
      setOverrideModalOpen(false);
      setOverrideReason('');
    } catch (err: any) {
      console.error('Failed to override DRD segment:', err);
      setOverrideActionError(err.response?.data?.message || err.message || 'Failed to save manual override');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleResetOverride = async () => {
    if (!selectedDealerId || selectedDealerId === 'all') return;
    try {
      setOverrideSubmitting(true);
      setOverrideActionError(null);
      await resetDealerRelationshipOverride(selectedDealerId, 'Reset to system calculation');
      const updated = await getDealerRelationshipDrawer(selectedDealerId);
      setDrdData(updated);
      setOverrideModalOpen(false);
      setOverrideReason('');
    } catch (err: any) {
      console.error('Failed to reset DRD override:', err);
      setOverrideActionError(err.response?.data?.message || err.message || 'Failed to reset manual override');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleClearDealer = () => {
    setSelectedDealerId(null);
    setSelectedDealerObj(null);
    onSelectDealerId?.(null);
    if (activeTab === 'drd') setActiveTab('mom');
  };

  // Header Title & Location derivation
  const isDealerSelected = Boolean(selectedDealerId && selectedDealerId !== 'all');
  const isGroupSelected = Boolean(selectedGroup);
  const headerLocation = isDealerSelected ? (selectedDealerObj || appHistoryData?.location) : null;

  const profile = drdData?.profile;

  const demandBadgeClass = useMemo(() => {
    switch (profile?.relationshipDemand) {
      case 'high_tlc':
        return styles.demandHighTlc;
      case 'self_sufficient':
        return styles.demandSelfSuff;
      case 'comfort_stop':
        return styles.demandComfortStop;
      default:
        return styles.demandDiscovery;
    }
  }, [profile?.relationshipDemand]);

  const demandLabel = useMemo(() => {
    switch (profile?.relationshipDemand) {
      case 'high_tlc':
        return '🔴 High TLC (Spike & Decay)';
      case 'self_sufficient':
        return '🟢 Autonomous (Organic Flow)';
      case 'comfort_stop':
        return '🟠 Comfort Stop (Time Sink)';
      default:
        return '⚪ Discovery Queue';
    }
  }, [profile?.relationshipDemand]);

  const urgencyBadgeClass = useMemo(() => {
    switch (profile?.urgencyStatus) {
      case 'overdue':
        return styles.urgencyOverdue;
      case 'due_soon':
        return styles.urgencyDueSoon;
      case 'on_track':
        return styles.urgencyOnTrack;
      case 'dormant':
        return styles.urgencyDormant;
      default:
        return styles.urgencyDueSoon;
    }
  }, [profile?.urgencyStatus]);

  const urgencyLabel = useMemo(() => {
    if (!profile) return '⚪ NOT MONITORED';
    switch (profile.urgencyStatus) {
      case 'overdue':
        return `🚨 OVERDUE (${profile.daysSinceLastVisit || 0}d unvisited)`;
      case 'due_soon':
        return `⏳ DUE SOON (${profile.daysSinceLastVisit || 0}d unvisited)`;
      case 'on_track':
        return `✅ ON TRACK (${profile.daysSinceLastVisit || 0}d unvisited)`;
      case 'dormant':
        return `💤 DORMANT (${profile.daysSinceLastVisit || 0}d unvisited)`;
      case 'self_sufficient':
        return '🟢 AUTONOMOUS (Portal Flow)';
      default:
        return '⚪ NOT MONITORED';
    }
  }, [profile?.urgencyStatus, profile?.daysSinceLastVisit, profile]);

  const headerTitle = isDealerSelected
    ? (profile?.dealerName || headerLocation?.dealerName || selectedDealerObj?.dealerName || selectedDealerId)
    : isGroupSelected
    ? `Group: ${groupName}`
    : selectedUnderwriter
    ? `Underwriter Applications: ${selectedUnderwriter}`
    : 'Network Historical Analytics';

  // Resolve table row data for sticky stats bar (called unconditionally before early return)
  const currentTableDealer = useMemo(() => {
    if (!selectedDealerId || selectedDealerId === 'all') return null;
    if (tableRowData && (
      tableRowData._id === selectedDealerId ||
      tableRowData.dealerId === selectedDealerId ||
      tableRowData.clientDealerId === selectedDealerId ||
      tableRowData.location?._id === selectedDealerId ||
      tableRowData.location?.dealerId === selectedDealerId ||
      tableRowData.location?.clientDealerId === selectedDealerId
    )) {
      return tableRowData;
    }
    if (allTableDealers && allTableDealers.length > 0) {
      const found = allTableDealers.find(
        (d: any) => d._id === selectedDealerId ||
                    d.dealerId === selectedDealerId ||
                    d.clientDealerId === selectedDealerId ||
                    d.location?._id === selectedDealerId ||
                    d.location?.dealerId === selectedDealerId ||
                    d.location?.clientDealerId === selectedDealerId
      );
      if (found) return found;
    }
    return tableRowData || null;
  }, [selectedDealerId, tableRowData, allTableDealers]);

  const tableStats = currentTableDealer?.stats || currentTableDealer?.rollingAvg || (currentTableDealer as any)?.stat;
  const tableTrends = tableStats?.trends || currentTableDealer?.trends;
  const snap = currentTableDealer?.latestSnapshot;

  const renderStickyMetric = (
    label: string,
    val: number | undefined | null,
    trend?: MetricTrend,
    type: 'count' | 'dollar' | 'percent' = 'count'
  ) => {
    const currentFormatted = formatStatValue(val, type);
    const baselineFormatted = trend ? formatStatValue(trend.baseline, type) : null;
    const isUp = (trend?.pct || 0) > 0;
    const isDown = (trend?.pct || 0) < 0;

    return (
      <div key={label} className={styles.stickyMetricCard}>
        <span className={styles.stickyMetricLabel}>{label}</span>
        <span className={styles.stickyMetricValue}>{currentFormatted}</span>
        {trend && trend.pct != null && trend.pct !== 0 ? (
          <span className={`${styles.stickyMetricTrend} ${isUp ? styles.trendUp : isDown ? styles.trendDown : styles.trendNeutral}`}>
            {isUp ? '↑ +' : '↓ '}{trend.pct}% {trend.baseline != null && trend.baseline > 0 ? `(${baselineFormatted})` : ''}
          </span>
        ) : (
          <span className={`${styles.stickyMetricTrend} ${styles.trendNeutral}`}>—</span>
        )}
      </div>
    );
  };

  if (!isOpen) return null;

  const months = data?.months || [];
  const displayedMonths = timeframeMode === 'ytd' ? months.filter((m) => m.year === 2026) : months;

  // Aggregate Totals across current items displayed in table/chart
  const totals = {
    apps: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0),
    approvals: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0),
    leadBooked: displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked || 0), 0),
    leadBookedDollars: displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBookedDollars || 0), 0),
    booked: displayedMonths.reduce((acc, m) => acc + (m.stats?.closeBooked || m.stats?.booked || 0), 0),
    bookedDollars: displayedMonths.reduce((acc, m) => acc + (m.stats?.closeBookedDollars || m.stats?.bookedDollars || 0), 0),
    lookToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked ?? 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.apps || 0), 0)
      : 0,
    approvalToBook: displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0) > 0
      ? displayedMonths.reduce((acc, m) => acc + (m.stats?.leadBooked ?? 0), 0) / displayedMonths.reduce((acc, m) => acc + (m.stats?.approvals || 0), 0)
      : 0,
    latestCohort: displayedMonths.length > 0 ? displayedMonths[displayedMonths.length - 1].cohorts : null,
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className="mobileDragHandleRow">
          <div className="mobileDragHandle" />
        </div>

        {/* Drawer Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            {isDealerSelected ? (
              <div className={styles.dealerHeaderMeta}>
                <div className={styles.dealerTitleRow}>
                  <h2 className={styles.title}>
                    {profile?.dealerName || headerLocation?.dealerName || selectedDealerObj?.dealerName || selectedDealerId}
                  </h2>
                  {(profile?.clientDealerId || headerLocation?.dealerId || selectedDealerId) && (
                    <span className={styles.dealerCodeBadge}>
                      ID: {profile?.clientDealerId || headerLocation?.dealerId || selectedDealerId}
                    </span>
                  )}
                  {(profile?.statePrefix || headerLocation?.statePrefix) && (
                    <span className={styles.stateBadge}>
                      {profile?.statePrefix || headerLocation?.statePrefix}
                    </span>
                  )}
                  {((headerLocation as any)?.groupName || (profile as any)?.groupName || (profile as any)?.dealerGroup?.name) && (
                    <span className={styles.groupBadge}>
                      {(headerLocation as any)?.groupName || (profile as any)?.groupName || (profile as any)?.dealerGroup?.name}
                    </span>
                  )}
                </div>

                {profile && (
                  <div className={styles.headerMetaRow}>
                    <span className={styles.repInfo}>
                      <UserCheck size={14} color="#38bdf8" />
                      <span>Assigned Rep: <strong>{profile.assignedRep || 'Unassigned'}</strong></span>
                    </span>
                    <div className={styles.badgeGroup}>
                      <span className={`${styles.demandBadge} ${demandBadgeClass}`}>
                        {demandLabel}
                      </span>
                      {profile.relationshipDemand === 'high_tlc' && (
                        <span className={`${styles.urgencyBadge} ${urgencyBadgeClass}`}>
                          {urgencyLabel}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <h2 className={styles.title}>{headerTitle}</h2>
                {headerLocation && (
                  <div className={styles.metaRow}>
                    {headerLocation.dealerId && <span className={styles.badge}>ID: {headerLocation.dealerId}</span>}
                    {headerLocation.statePrefix && <span className={styles.badge}>{headerLocation.statePrefix}</span>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Header Tab Buttons */}
          <div className={styles.drawerTabs}>
            {isDealerSelected && (
              <button
                className={`${styles.tabBtn} ${activeTab === 'drd' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('drd')}
              >
                <Activity size={14} />
                <span>DRD Profile</span>
              </button>
            )}
            <button
              className={`${styles.tabBtn} ${activeTab === 'mom' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('mom')}
            >
              <TrendingUp size={14} />
              <span>Historical MoM</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'applications' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('applications')}
            >
              <FileText size={14} />
              <span>Application History</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'communications' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('communications')}
            >
              <MessageSquare size={14} />
              <span>Communication History</span>
            </button>
          </div>

          <button className={styles.closeBtn} onClick={onClose} aria-label="Close drawer">
            <X size={18} />
          </button>
        </div>

        {/* Sticky Live Table Stats & Trend Bar (Shown when a dealer is selected) */}
        {isDealerSelected && (
          <div className={styles.stickyStatsBar}>
            <div className={styles.stickyContextRow}>
              <div className={styles.stickyContextLeft}>
                <span className={styles.stickyDateTag}>
                  <Calendar size={12} />
                  <span>
                    {dateRangeStr || datePresetLabel
                      ? `${(datePresetLabel || 'WINDOW').replace(/_/g, ' ').toUpperCase()}${dateRangeStr ? ` : ${dateRangeStr}` : ''}`
                      : 'Active Rolling Window'}
                  </span>
                </span>
                {comparisonLabel && (
                  <span className={styles.stickyComparisonTag}>
                    <TrendingUp size={12} color="#38bdf8" />
                    <span>{comparisonLabel}</span>
                  </span>
                )}
                {currentTableDealer?.status && (
                  <span
                    className={styles.recencyPill}
                    style={{
                      color: currentTableDealer.status === 'active' ? '#34d399' : '#f87171',
                      fontWeight: 600
                    }}
                  >
                    {currentTableDealer.status.replace(/_/g, ' ').toUpperCase()}
                  </span>
                )}
              </div>

              {/* Recency indicators */}
              <div className={styles.stickyRecencies}>
                {(snap?.daysSinceLastApplication ?? currentTableDealer?.daysSinceLastApplication) != null && (
                  <span className={styles.recencyPill}>
                    Last App: <strong>{snap?.daysSinceLastApplication ?? currentTableDealer?.daysSinceLastApplication}d</strong>
                  </span>
                )}
                {(snap?.daysSinceLastBooking ?? currentTableDealer?.daysSinceLastBooking) != null && (
                  <span className={styles.recencyPill}>
                    Last BKD: <strong>{snap?.daysSinceLastBooking ?? currentTableDealer?.daysSinceLastBooking}d</strong>
                  </span>
                )}
                {profile?.daysSinceLastVisit != null && (
                  <span className={styles.recencyPill}>
                    Last Visit: <strong>{profile.daysSinceLastVisit}d</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Metrics Grid matching Table Columns */}
            <div className={styles.stickyMetricsGrid}>
              {renderStickyMetric('Apps', tableStats?.apps ?? profile?.pipelineStats?.totalApplications, tableTrends?.apps, 'count')}
              {renderStickyMetric('Approvals', tableStats?.approvals ?? profile?.pipelineStats?.totalApproved, tableTrends?.approvals, 'count')}
              {renderStickyMetric('App BKD', tableStats?.leadBooked ?? currentTableDealer?.leadBooked, tableTrends?.leadBooked, 'count')}
              {renderStickyMetric('App $', tableStats?.leadBookedDollars ?? currentTableDealer?.leadBookedDollars, tableTrends?.leadBookedDollars, 'dollar')}
              {renderStickyMetric('Funded BKD', tableStats?.booked ?? profile?.pipelineStats?.totalBookings, tableTrends?.booked, 'count')}
              {renderStickyMetric('Funded $', tableStats?.bookedDollars ?? profile?.lifetimeStats?.totalBookedVolume, tableTrends?.bookedDollars, 'dollar')}
              {renderStickyMetric('Look-to-Book', tableStats?.lookToBook != null ? tableStats.lookToBook : (profile?.pipelineStats?.lookToBookPct ? profile.pipelineStats.lookToBookPct / 100 : null), tableTrends?.lookToBook, 'percent')}
              {renderStickyMetric('Appr-to-Book', tableStats?.approvalToBook != null ? tableStats.approvalToBook : (profile?.pipelineStats?.approvalToBookPct ? profile.pipelineStats.approvalToBookPct / 100 : null), tableTrends?.approvalToBook, 'percent')}
              {renderStickyMetric('Avg FICO', tableStats?.avgFico ?? currentTableDealer?.avgFico, undefined, 'count')}
            </div>
          </div>
        )}

        {/* TAB 0: RELATIONSHIP DEMAND (DRD) PROFILE */}
        {activeTab === 'drd' && isDealerSelected && (
          <div className={styles.drdContent}>
            {drdLoading ? (
              <div className={styles.drawerLoading}>
                <div className={styles.spinner} />
                <span>Analyzing relationship demand & behavioral cycles...</span>
              </div>
            ) : drdError ? (
              <div className={styles.drawerLoading}>
                <AlertTriangle size={24} color="#ef4444" />
                <span style={{ color: '#ef4444' }}>{drdError}</span>
              </div>
            ) : profile ? (
              <div className={styles.drdBody}>
                {/* Compact 4-Column Diagnostic KPI Matrix */}
                <div className={styles.compactKpiGrid}>
                  <div className={styles.compactKpiCard}>
                    <div className={styles.compactKpiHeader}>
                      <span className={styles.compactKpiLabel}>Lifetime Booked $</span>
                    </div>
                    <span className={styles.compactKpiValue}>
                      {formatDollar(profile.lifetimeStats?.totalBookedVolume || 0)}
                    </span>
                    <span className={styles.compactKpiSub}>
                      {profile.lifetimeStats?.totalBookings || 0} funded deals
                    </span>
                    <div className={styles.compactKpiDivider} />
                    <div className={styles.compactKpiSecondaryRow}>
                      <span className={styles.compactKpiSecondaryLabel}>Yield / Visit:</span>
                      <span className={styles.compactKpiSecondaryVal} style={{ color: (profile.lifetimeYieldPerVisit || 0) > 50000 ? '#34d399' : '#cbd5e1' }}>
                        {formatDollar(profile.lifetimeYieldPerVisit || 0)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.compactKpiCard}>
                    <div className={styles.compactKpiHeader}>
                      <span className={styles.compactKpiLabel}>Post-Visit Lift</span>
                    </div>
                    <span className={styles.compactKpiValue} style={{ color: (profile.postVisitBookedLiftPct || 0) >= 70 ? '#f87171' : '#34d399' }}>
                      {profile.postVisitBookedLiftPct !== null ? `${profile.postVisitBookedLiftPct}%` : '0%'}
                    </span>
                    <span className={styles.compactKpiSub}>
                      {(profile.postVisitBookedLiftPct || 0) >= 70 ? 'Spike & decay' : 'Organic portal flow'}
                    </span>
                    <div className={styles.compactKpiDivider} />
                    <div className={styles.compactKpiSecondaryRow}>
                      <span className={styles.compactKpiSecondaryLabel}>Look-to-Book:</span>
                      <span className={styles.compactKpiSecondaryVal}>
                        {profile.pipelineStats?.lookToBookPct ? `${profile.pipelineStats.lookToBookPct}%` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.compactKpiCard}>
                    <div className={styles.compactKpiHeader}>
                      <span className={styles.compactKpiLabel}>In-Person Visits</span>
                    </div>
                    <span className={styles.compactKpiValue}>
                      {profile.lifetimeStats?.totalVisits || 0}
                    </span>
                    <span className={styles.compactKpiSub}>
                      {profile.verifiedCycleCount || 0} independent clusters
                    </span>
                    <div className={styles.compactKpiDivider} />
                    <div className={styles.compactKpiSecondaryRow}>
                      <span className={styles.compactKpiSecondaryLabel}>Apps Submitted:</span>
                      <span className={styles.compactKpiSecondaryVal}>
                        {profile.pipelineStats?.totalApplications?.toLocaleString() || '0'}
                      </span>
                    </div>
                  </div>

                  <div className={styles.compactKpiCard}>
                    <div className={styles.compactKpiHeader}>
                      <span className={styles.compactKpiLabel}>Approvals</span>
                    </div>
                    <span className={styles.compactKpiValue} style={{ color: '#38bdf8' }}>
                      {profile.pipelineStats?.totalApproved?.toLocaleString() || '0'}
                    </span>
                    <span className={styles.compactKpiSub}>
                      {profile.pipelineStats?.approvalRatePct ? `${profile.pipelineStats.approvalRatePct}% approval rate` : '—'}
                    </span>
                    <div className={styles.compactKpiDivider} />
                    <div className={styles.compactKpiSecondaryRow}>
                      <span className={styles.compactKpiSecondaryLabel}>Top Lender:</span>
                      <span className={styles.compactKpiSecondaryVal}>
                        {profile.pipelineStats?.topLender || 'Standard Tier'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decision Audit Box */}
                <div className={styles.decisionAuditBox}>
                  <div className={styles.auditHeader}>
                    <div className={styles.auditTitle}>
                      <ShieldCheck size={14} />
                      <span>System Decision Audit</span>
                    </div>
                    <span className={styles.confidencePill}>
                      Confidence: {Math.round(profile.confidenceScore * 100)}%
                    </span>
                  </div>

                  <ul className={styles.rationaleList}>
                    {profile.decisionRationale && profile.decisionRationale.length > 0 ? (
                      profile.decisionRationale.map((rationale, idx) => (
                        <li key={idx} className={styles.rationaleItem}>
                          • {rationale}
                        </li>
                      ))
                    ) : (
                      <li className={styles.rationaleItem}>
                        • No decision rationale available.
                      </li>
                    )}
                  </ul>
                </div>

                {/* Manual DRD Reconciliation & Human Override Card */}
                <div
                  style={{
                    background: profile.manualOverride?.isOverridden
                      ? 'rgba(234, 179, 8, 0.08)'
                      : 'rgba(30, 41, 59, 0.5)',
                    border: `1px solid ${
                      profile.manualOverride?.isOverridden
                        ? 'rgba(234, 179, 8, 0.35)'
                        : 'rgba(255, 255, 255, 0.08)'
                    }`,
                    borderRadius: '8px',
                    padding: '14px 16px',
                    marginBottom: '16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {profile.manualOverride?.isOverridden ? (
                        <Lock size={16} color="#eab308" />
                      ) : (
                        <Unlock size={16} color="#94a3b8" />
                      )}
                      <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#f8fafc' }}>
                        DRD Human Reconciliation Status
                      </span>
                      {profile.manualOverride?.isOverridden ? (
                        <span
                          style={{
                            background: 'rgba(234, 179, 8, 0.18)',
                            color: '#facc15',
                            border: '1px solid rgba(234, 179, 8, 0.4)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          🔒 Manually Locked
                        </span>
                      ) : (
                        <span
                          style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          ⚡ Automated Classification
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {profile.manualOverride?.isOverridden && (
                        <button
                          type="button"
                          onClick={handleResetOverride}
                          disabled={overrideSubmitting}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            color: '#f87171',
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '0.76rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Reset to System Calculation
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setOverrideModalOpen(!overrideModalOpen);
                          setOverrideSegment(profile.relationshipDemand || 'high_tlc');
                          setOverrideReason(profile.manualOverride?.reason || '');
                        }}
                        style={{
                          background: 'rgba(56, 189, 248, 0.15)',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          color: '#38bdf8',
                          padding: '4px 10px',
                          borderRadius: '5px',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {profile.manualOverride?.isOverridden ? 'Edit Override' : 'Override DRD Segment'}
                      </button>
                    </div>
                  </div>

                  {profile.manualOverride?.isOverridden && (
                    <div
                      style={{
                        background: 'rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: '#cbd5e1',
                        marginBottom: '8px',
                      }}
                    >
                      <div style={{ marginBottom: '4px' }}>
                        <strong style={{ color: '#facc15' }}>Active Override: </strong>
                        <span>Classified as <strong>{profile.relationshipDemand?.replace(/_/g, ' ').toUpperCase()}</strong> (system calculated {profile.manualOverride.originalSegment || 'unclassified'})</span>
                      </div>
                      <div style={{ marginBottom: '4px' }}>
                        <strong>Reason: </strong>
                        <span style={{ fontStyle: 'italic', color: '#e2e8f0' }}>"{profile.manualOverride.reason}"</span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        By {profile.manualOverride.overriddenBy?.name || profile.manualOverride.overriddenBy?.email || 'Authorized Manager'} • {profile.manualOverride.overriddenAt ? new Date(profile.manualOverride.overriddenAt).toLocaleString() : 'Recently'}
                      </div>
                    </div>
                  )}

                  {/* Inline Override Form when expanded */}
                  {overrideModalOpen && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '12px',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
                        Select Target Classification & Document Required Reason:
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '10px' }}>
                        {[
                          { key: 'high_tlc', label: '🔴 High TLC', desc: 'Touch-sensitive, high yield lift from visits' },
                          { key: 'self_sufficient', label: '🟢 Autonomous', desc: 'Self-sufficient digital portal usage' },
                          { key: 'comfort_stop', label: '🟠 Comfort Stop', desc: 'Frequent visits with flat/low yield' },
                          { key: 'insufficient_data', label: '⚪ Discovery Queue', desc: 'Awaiting visit cycle benchmarks' },
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setOverrideSegment(opt.key as any)}
                            style={{
                              padding: '8px',
                              borderRadius: '6px',
                              border: overrideSegment === opt.key ? '1.5px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                              background: overrideSegment === opt.key ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                              color: overrideSegment === opt.key ? '#38bdf8' : '#cbd5e1',
                              textAlign: 'left',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{opt.label}</div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '2px' }}>{opt.desc}</div>
                          </button>
                        ))}
                      </div>

                      <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>
                          Reason for Manual Override <span style={{ color: '#f87171' }}>* (Required for audit logging)</span>:
                        </label>
                        <textarea
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="e.g. Account owner requested monthly rep lunch; proven $500K seasonal spring lift despite portal inactivity..."
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            borderRadius: '5px',
                            color: '#f8fafc',
                            fontSize: '0.8rem',
                            outline: 'none',
                            resize: 'vertical',
                          }}
                        />
                      </div>

                      {overrideActionError && (
                        <div style={{ color: '#f87171', fontSize: '0.78rem', marginBottom: '8px' }}>
                          ⚠️ {overrideActionError}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setOverrideModalOpen(false)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#94a3b8',
                            padding: '5px 12px',
                            borderRadius: '4px',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveOverride}
                          disabled={overrideSubmitting}
                          style={{
                            background: '#0284c7',
                            border: 'none',
                            color: '#fff',
                            padding: '5px 14px',
                            borderRadius: '4px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          {overrideSubmitting ? 'Saving...' : 'Lock Manual Override'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Expandable Reconciliation History Log */}
                  {profile.manualOverride?.history && profile.manualOverride.history.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setShowAuditHistory(!showAuditHistory)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: 0,
                        }}
                      >
                        <History size={12} />
                        <span>{showAuditHistory ? 'Hide' : 'Show'} Audit History Log ({profile.manualOverride.history.length} changes)</span>
                      </button>

                      {showAuditHistory && (
                        <div
                          style={{
                            marginTop: '8px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            padding: '8px 10px',
                            maxHeight: '160px',
                            overflowY: 'auto',
                          }}
                        >
                          {(profile.manualOverride?.history || []).slice().reverse().map((entry: any, hIdx: number) => (
                            <div
                              key={hIdx}
                              style={{
                                padding: '6px 0',
                                borderBottom: hIdx < (profile.manualOverride?.history?.length || 0) - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                                fontSize: '0.74rem',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '2px' }}>
                                <span><strong>{entry.action?.toUpperCase() || 'CHANGE'}</strong>: {entry.previousSegment || 'system'} ➔ <strong style={{ color: '#38bdf8' }}>{entry.newSegment || 'system'}</strong></span>
                                <span>{entry.changedAt ? new Date(entry.changedAt).toLocaleString() : '—'}</span>
                              </div>
                              <div style={{ color: '#cbd5e1' }}>"{entry.reason || 'No reason provided'}"</div>
                              <div style={{ color: '#64748b', fontSize: '0.68rem', marginTop: '2px' }}>
                                By {entry.changedBy?.name || entry.changedBy?.email || 'Authorized User'}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Visual Cause & Effect Timeline Chart (Condensed) */}
                {profile.timelineMonthly && profile.timelineMonthly.length > 0 && (
                  <div className={styles.chartSection}>
                    <div className={styles.chartHeader}>
                      <span className={styles.chartTitle}>
                        <TrendingUp size={14} color="#38bdf8" />
                        <span>Cause & Effect Timeline (2024–2026)</span>
                      </span>
                      <div className={styles.chartLegend}>
                        <span className={styles.legendItem}>
                          <span className={styles.legendDotApp} /> Apps Submitted
                        </span>
                        <span className={styles.legendItem}>
                          <span className={styles.legendDotBooked} /> Booked $
                        </span>
                        <span className={styles.legendItem}>
                          <span className={styles.legendPinVisit}>📍</span> In-Person Visit
                        </span>
                      </div>
                    </div>

                    {/* Pure SVG Dual-Axis Chart */}
                    <div style={{ position: 'relative', width: '100%', height: 165, marginTop: 6 }}>
                      {(() => {
                        const timeline = profile.timelineMonthly || [];
                        const maxApps = Math.max(1, ...(timeline.map((t) => t.appCount) || [1]));
                        const maxVolume = Math.max(1000, ...(timeline.map((t) => t.bookedVolume) || [1000]));

                        return (
                          <>
                            <svg
                              viewBox="0 0 740 165"
                              style={{ width: '100%', height: '100%', overflow: 'visible' }}
                            >
                              <line x1="0" y1="135" x2="740" y2="135" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                              <line x1="0" y1="75" x2="740" y2="75" stroke="rgba(255,255,255,0.04)" strokeDasharray="3,3" />

                              {timeline.map((item, idx) => {
                                const totalBars = timeline.length;
                                const barWidth = Math.max(10, 700 / totalBars);
                                const x = 20 + idx * barWidth;

                                const appHeight = Math.max(2, (item.appCount / maxApps) * 105);
                                const bookedHeight = Math.max(2, (item.bookedVolume / maxVolume) * 105);

                                const appY = 135 - appHeight;
                                const bookedY = 135 - bookedHeight;
                                const hasVisit = item.visitCount > 0;

                                return (
                                  <g
                                    key={item.monthKey}
                                    onMouseEnter={() => setHoveredMonth(item)}
                                    onMouseLeave={() => setHoveredMonth(null)}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    <rect
                                      x={x}
                                      y={10}
                                      width={barWidth}
                                      height={135}
                                      fill="transparent"
                                      className={styles.chartColHitbox}
                                    />
                                    <rect
                                      x={x}
                                      y={appY}
                                      width={Math.max(3, barWidth / 2 - 2)}
                                      height={appHeight}
                                      fill="#38bdf8"
                                      opacity={0.85}
                                      rx="2"
                                    />
                                    {item.bookedVolume > 0 && (
                                      <rect
                                        x={x + barWidth / 2}
                                        y={bookedY}
                                        width={Math.max(3, barWidth / 2 - 2)}
                                        height={bookedHeight}
                                        fill="#4ade80"
                                        opacity={0.9}
                                        rx="2"
                                      />
                                    )}
                                    {hasVisit && (
                                      <text
                                        x={x + barWidth / 2}
                                        y={Math.min(appY, bookedY) - 6}
                                        textAnchor="middle"
                                        fontSize="12"
                                      >
                                        📍
                                      </text>
                                    )}
                                    {idx % 2 === 0 && (
                                      <text
                                        x={x + barWidth / 2}
                                        y="152"
                                        fill="#94a3b8"
                                        fontSize="10"
                                        textAnchor="middle"
                                        fontWeight="500"
                                      >
                                        {item.monthKey.slice(5)}
                                      </text>
                                    )}
                                  </g>
                                );
                              })}
                            </svg>

                            {hoveredMonth && (
                              <div className={styles.chartTooltip}>
                                <strong>{hoveredMonth.monthKey}</strong>
                                <span>Apps: {hoveredMonth.appCount}</span>
                                <span>Booked: {formatDollar(hoveredMonth.bookedVolume)}</span>
                                {hoveredMonth.visitCount > 0 && (
                                  <span style={{ color: '#f87171' }}>Visits: {hoveredMonth.visitCount}</span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Communication & Interaction Cycles Section */}
                <div className={styles.cyclesSection}>
                  <div className={styles.cyclesHeader}>
                    <div className={styles.cyclesTitle}>
                      <Calendar size={16} color="#38bdf8" />
                      <span>Recorded Communication & Interaction Cycles</span>
                    </div>
                    <span className={styles.cyclesCountBadge}>
                      {profile.interactionCycles?.length || 0} Cycles Logged
                    </span>
                  </div>

                  <div className={styles.cyclesList}>
                    {profile.interactionCycles && profile.interactionCycles.length > 0 ? (
                      profile.interactionCycles.map((cycle) => (
                        <div key={cycle.cycleNumber} className={styles.cycleCard}>
                          <div className={styles.cycleTop}>
                            <span className={styles.cycleTitle}>
                              <Activity size={14} color="#38bdf8" />
                              <span>Cycle #{cycle.cycleNumber}</span>
                              <span className={styles.cycleDates}>
                                ({new Date(cycle.startDate).toLocaleDateString()} — {new Date(cycle.endDate).toLocaleDateString()})
                              </span>
                            </span>
                            <span
                              className={styles.cycleOutcomeBadge}
                              style={{
                                background: cycle.metrics.bookedInWindow > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                color: cycle.metrics.bookedInWindow > 0 ? '#34d399' : '#f87171',
                                border: `1px solid ${cycle.metrics.bookedInWindow > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                              }}
                            >
                              {cycle.metrics.bookedInWindow > 0 ? `+$${(cycle.metrics.bookedVolumeInWindow / 1000).toFixed(0)}K Booked (${cycle.metrics.bookedInWindow} deals)` : '$0 Booked'}
                            </span>
                          </div>

                          <p className={styles.cycleSummaryText}>{cycle.summaryText}</p>

                          <div className={styles.cycleMetricsRow}>
                            <span>Visits in Cluster: <strong className={styles.cycleMetricVal}>{cycle.visitCountInCluster}</strong></span>
                            <span>Relative Lift: <strong className={styles.cycleMetricVal}>+{cycle.metrics.relativeBookedLift}x</strong></span>
                            <span>Pattern: <strong className={styles.cycleMetricVal}>{(cycle.metrics.patternObserved || 'unexplored').replace(/_/g, ' ')}</strong></span>
                            {cycle.metrics.daysToFirstBooked != null && (
                              <span>Days to 1st Booking: <strong className={styles.cycleMetricVal}>{cycle.metrics.daysToFirstBooked}d</strong></span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                        No recorded visit interaction cycles for this dealer. Rooftop is currently in Discovery Queue.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.drawerLoading}>
                <span>No relationship demand profile found for this dealer location.</span>
              </div>
            )}
          </div>
        )}

        {/* TAB 1: HISTORICAL MOM */}
        {activeTab === 'mom' && (
          <>
            {/* Filter Controls Header */}
            <div className={styles.filterControls}>
              {/* Timeframe Scope Toggle */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Timeframe:</span>
                <div className={styles.trendToggle}>
                  <button
                    className={`${styles.toggleBtn} ${timeframeMode === 'all' ? styles.toggleActive : ''}`}
                    onClick={() => setTimeframeMode('all')}
                  >
                    All Months (2025-Present)
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${timeframeMode === 'ytd' ? styles.toggleActive : ''}`}
                    onClick={() => setTimeframeMode('ytd')}
                  >
                    YTD Only (2026)
                  </button>
                </div>
              </div>

              {/* Trend Mode Toggle */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Trend Mode:</span>
                <div className={styles.trendToggle}>
                  <button
                    className={`${styles.toggleBtn} ${trendMode === 'mom' ? styles.toggleActive : ''}`}
                    onClick={() => setTrendMode('mom')}
                  >
                    Period-over-Period (MoM)
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${trendMode === 'yoy' ? styles.toggleActive : ''}`}
                    onClick={() => setTrendMode('yoy')}
                  >
                    vs Last Year (YoY)
                  </button>
                </div>
              </div>

              {/* State Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>State:</span>
                <select
                  className={styles.selectInput}
                  value={selectedState || ''}
                  onChange={(e) => setSelectedState(e.target.value)}
                >
                  <option value="">All States</option>
                  {filteredStates.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sales Rep Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Sales Rep:</span>
                <select
                  className={styles.selectInput}
                  value={selectedRep || ''}
                  onChange={(e) => setSelectedRep(e.target.value)}
                >
                  <option value="">All Reps</option>
                  {repList.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/* Dealer Group Filter */}
              <div className={styles.filterGroup}>
                <span className={styles.filterLabel}>Dealer Group:</span>
                <select
                  className={styles.selectInput}
                  value={selectedGroup || ''}
                  onChange={(e) => {
                    setSelectedGroup(e.target.value);
                    onSelectGroupSlug?.(e.target.value || null);
                  }}
                >
                  <option value="">All Groups</option>
                  {filteredGroups.map((g) => (
                    <option key={g.slug} value={g.slug}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* NEW: Searchable Dealer Selector Filter */}
              <div className={styles.filterGroup} ref={dropdownRef}>
                <span className={styles.filterLabel}>Dealer:</span>
                <button
                  className={styles.dealerSelectBtn}
                  onClick={() => {
                    setDealerSearchOpen(!dealerSearchOpen);
                    if (!dealerSearchOpen) {
                      searchDealers('', 50).then((res) => {
                        if (res?.dealers) setDealerSearchResults(res.dealers);
                      }).catch(console.error);
                    }
                  }}
                >
                  <span>{selectedDealerId ? (selectedDealerObj?.dealerName || selectedDealerId) : 'All Dealers (Search...)'}</span>
                  {selectedDealerId ? (
                    <span
                      className={styles.clearDealerBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearDealer();
                      }}
                      title="Clear dealer selection"
                    >
                      ✕
                    </span>
                  ) : (
                    <span style={{ fontSize: '10px', marginLeft: '4px' }}>▼</span>
                  )}
                </button>

                {/* Dealer Search Menu Popup */}
                {dealerSearchOpen && (
                  <div className={styles.searchMenu}>
                    <div className={styles.searchHeader}>
                      <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Search 3k+ dealers by name or ID..."
                        value={dealerSearchQuery || ''}
                        onChange={(e) => setDealerSearchQuery(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className={styles.searchList}>
                      <div
                        className={`${styles.searchOption} ${!selectedDealerId ? styles.searchOptionSelected : ''}`}
                        onClick={() => handleSelectDealer(null)}
                      >
                        <span>All Dealers</span>
                      </div>
                      {dealerSearchResults.map((dlr) => (
                        <div
                          key={dlr._id}
                          className={`${styles.searchOption} ${selectedDealerId === dlr.dealerId || selectedDealerId === dlr._id ? styles.searchOptionSelected : ''}`}
                          onClick={() => handleSelectDealer(dlr)}
                        >
                          <div>
                            <div>{dlr.dealerName}</div>
                            <span className={styles.optionMeta}>ID: {dlr.dealerId || dlr.clientDealerId}</span>
                          </div>
                          {dlr.statePrefix && <span className={styles.badge}>{dlr.statePrefix}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Body (Chart + Rollup Table) */}
            {/* Drawer Body (Table) */}
            <div className={styles.drawerContent}>
              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                  Loading historical analytics...
                </div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Active Dealers</th>
                        <th>30d / 60d / 90d+ Inactive</th>
                        <th>Apps</th>
                        <th>Approvals</th>
                        <th>App BKD</th>
                        <th>App $</th>
                        <th>Funded BKD</th>
                        <th>Funded $</th>
                        <th>L-B %</th>
                        <th>A-B %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Summary Totals Row */}
                      <tr className={styles.totalsRow}>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>
                          TOTAL / OVERALL ({timeframeMode === 'ytd' ? 'YTD 2026' : '2025–Present'})
                        </td>
                        <td>
                          {totals.latestCohort ? (
                            <>
                              <strong>{totals.latestCohort.active}</strong>{' '}
                              <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                                ({totals.latestCohort.activePct}% of {totals.latestCohort.total})
                              </span>
                            </>
                          ) : '—'}
                        </td>
                        <td style={{ color: '#94a3b8' }}>
                          {totals.latestCohort ? `${totals.latestCohort.inactive30} / ${totals.latestCohort.inactive60} / ${totals.latestCohort.longInactive}` : '—'}
                        </td>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>{totals.apps.toLocaleString()}</td>
                        <td style={{ color: '#60a5fa', fontWeight: 800 }}>{totals.approvals.toLocaleString()}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 800 }}>{totals.leadBooked.toLocaleString()}</td>
                        <td style={{ color: '#38bdf8', fontWeight: 800 }}>{formatCurrency(totals.leadBookedDollars)}</td>
                        <td style={{ color: '#4ade80', fontWeight: 800 }}>{totals.booked.toLocaleString()}</td>
                        <td style={{ color: '#4ade80', fontWeight: 800 }}>{formatCurrency(totals.bookedDollars)}</td>
                        <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.lookToBook * 100).toFixed(1)}%</td>
                        <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.approvalToBook * 100).toFixed(1)}%</td>
                      </tr>

                      {/* Monthly Rows (Most Recent First) */}
                      {[...displayedMonths].reverse().map((m: HistoricalMoMItem) => (
                        <tr key={m.key}>
                          <td style={{ fontWeight: 700, color: '#60a5fa' }}>{m.label}</td>
                          <td>
                            <strong>{m.cohorts.active}</strong>{' '}
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                              ({m.cohorts.activePct}% of {m.cohorts.total})
                            </span>
                          </td>
                          <td style={{ color: '#94a3b8' }}>
                            {m.cohorts.inactive30} / {m.cohorts.inactive60} / {m.cohorts.longInactive}
                          </td>
                          <td>
                            {m.stats.apps} {renderBadge(m.trends?.apps)}
                          </td>
                          <td>
                            {m.stats.approvals} {renderBadge(m.trends?.approvals)}
                          </td>
                          <td>
                            {m.stats.leadBooked ?? m.stats.booked} {renderBadge(m.trends?.leadBooked || m.trends?.booked)}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {formatCurrency(m.stats.leadBookedDollars ?? m.stats.bookedDollars)}{' '}
                            {renderBadge(m.trends?.leadBookedDollars || m.trends?.bookedDollars)}
                          </td>
                          <td>
                            {m.stats.closeBooked ?? m.stats.booked} {renderBadge(m.trends?.closeBooked || m.trends?.booked)}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {formatCurrency(m.stats.closeBookedDollars ?? m.stats.bookedDollars)}{' '}
                            {renderBadge(m.trends?.closeBookedDollars || m.trends?.bookedDollars)}
                          </td>
                          <td>{(m.stats.lookToBook * 100).toFixed(1)}% {renderBadge(m.trends?.lookToBook)}</td>
                          <td>{(m.stats.approvalToBook * 100).toFixed(1)}% {renderBadge(m.trends?.approvalToBook)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: APPLICATION HISTORY */}
        {activeTab === 'applications' && (
          <div className={styles.drawerContent}>
            {appHistoryLoading && appHistoryPage === 1 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Loading application history records...
              </div>
            ) : (
              <>
                {/* Summary Cards */}
                <div className={styles.summaryGrid}>
                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>All-Time</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.allTime.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.allTime.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.allTime.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.allTime.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>YTD</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.ytd.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.ytd.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.ytd.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.ytd.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className={styles.summaryCard}>
                    <span className={styles.cardScope}>MTD</span>
                    <div className={styles.cardMain}>
                      <span className={styles.cardValue}>{appHistoryData?.summary?.mtd.apps.toLocaleString() || '0'}</span>
                      <span className={styles.cardSub}>Apps</span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span>Appr: {appHistoryData?.summary?.mtd.approvals.toLocaleString() || '0'}</span>
                      <span>Bkd: {appHistoryData?.summary?.mtd.booked.toLocaleString() || '0'}</span>
                      <span>Dollars: ${(appHistoryData?.summary?.mtd.bookedDollars || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Application Records Table & Sub-filters */}
                <div className={styles.tableSection}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                    <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                      Application Records ({appHistoryData?.pagination?.totalCount || 0})
                    </h3>

                    {/* Filter Controls: Underwriter + Date Range */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      {/* Underwriter Dropdown */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Underwriter:</span>
                        <select
                          value={selectedUnderwriter || ''}
                          onChange={(e) => {
                            setSelectedUnderwriter(e.target.value);
                            setAppHistoryPage(1);
                          }}
                          style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            borderRadius: '6px',
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          <option value="">All Underwriters</option>
                          {underwriterList.map((uw) => (
                            <option key={uw} value={uw}>
                              {uw}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Date Range Presets */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8' }}>Period:</span>
                        <div style={{ display: 'flex', gap: '2px', background: 'rgba(255, 255, 255, 0.05)', padding: '2px', borderRadius: '6px' }}>
                          {[
                            { key: 'all', label: 'All' },
                            { key: 'mtd', label: 'MTD' },
                            { key: '30d', label: '30d' },
                            { key: '90d', label: '90d' },
                            { key: 'ytd', label: 'YTD' },
                            { key: 'custom', label: 'Custom' },
                          ].map((p) => (
                            <button
                              key={p.key}
                              onClick={() => handleAppDatePresetChange(p.key)}
                              style={{
                                background: appDatePreset === p.key ? '#0284c7' : 'transparent',
                                color: appDatePreset === p.key ? '#ffffff' : '#94a3b8',
                                border: 'none',
                                borderRadius: '4px',
                                padding: '3px 8px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Date Inputs */}
                      {appDatePreset === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="date"
                            value={appStartDate || ''}
                            onChange={(e) => {
                              setAppStartDate(e.target.value);
                              setAppHistoryPage(1);
                            }}
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#f8fafc',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                            }}
                          />
                          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>–</span>
                          <input
                            type="date"
                            value={appEndDate || ''}
                            onChange={(e) => {
                              setAppEndDate(e.target.value);
                              setAppHistoryPage(1);
                            }}
                            style={{
                              background: '#1e293b',
                              border: '1px solid #334155',
                              color: '#f8fafc',
                              padding: '3px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {appHistoryData?.applications.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      No application records found.
                    </div>
                  ) : (
                    <div className={styles.tableWrapper} style={{ maxHeight: '360px' }}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Application ID</th>
                            {!isDealerSelected && <th>Dealer</th>}
                            <th>Underwriter</th>
                            <th>Status</th>
                            <th>Date</th>
                            <th>Days Ago</th>
                            <th>Financed Amount</th>
                            <th>Lender</th>
                            <th>FICO</th>
                          </tr>
                        </thead>
                        <tbody>
                          {appHistoryData?.applications.map((app: ApplicationHistoryItem) => (
                            <tr
                              key={app._id}
                              className={styles.clickableRow}
                              onClick={() => setSelectedAppDetail(app)}
                              title="Click to view full application details"
                            >
                              <td className={styles.appIdCell}>{app.applicationId}</td>
                              {!isDealerSelected && (
                                <td>
                                  <div
                                    style={{ fontWeight: 600, color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectDealer({
                                        _id: app.clientDealerId || '',
                                        dealerName: app.dealerName || '',
                                        dealerId: app.clientDealerId || '',
                                        clientDealerId: app.clientDealerId || '',
                                        statePrefix: app.dealerState || ''
                                      });
                                    }}
                                    title={`Click to view DRD Profile & Analytics for ${app.dealerName}`}
                                  >
                                    {app.dealerName || '—'}
                                  </div>
                                  {app.dealerState && (
                                    <span className={styles.badge} style={{ fontSize: '0.65rem', marginTop: '2px', display: 'inline-block' }}>
                                      {app.dealerState}
                                    </span>
                                  )}
                                </td>
                              )}
                              <td style={{ fontWeight: 600, color: app.underwriter ? '#60a5fa' : '#64748b' }}>
                                {app.underwriter || '—'}
                              </td>
                              <td>
                                <span
                                  className={`${styles.statusTag} ${
                                    app.status === 'Booked'
                                      ? styles.statusBooked
                                      : app.status === 'Approved' || app.status === 'Auto Approval' || app.status === 'Conditional Approval'
                                      ? styles.statusApproved
                                      : styles.statusDefault
                                  }`}
                                >
                                  {app.status || 'Pending'}
                                </span>
                              </td>
                              <td>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '—'}</td>
                              <td className={styles.daysAgoCell}>
                                {app.daysAgo != null ? `${app.daysAgo}d ago` : '—'}
                              </td>
                              <td className={styles.amountCell}>
                                {app.amountFinanced != null ? `$${app.amountFinanced.toLocaleString()}` : '—'}
                              </td>
                              <td>{app.lender || '—'}</td>
                              <td className={styles.ficoCell}>{app.primaryFicoAuto8 || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {appHistoryData?.pagination && appHistoryData.pagination.totalPages > 1 && (
                    <div className={styles.paginationRow}>
                      <button
                        className={styles.pageBtn}
                        disabled={appHistoryPage <= 1 || appHistoryLoading}
                        onClick={() => setAppHistoryPage((p) => Math.max(1, p - 1))}
                      >
                        ← Previous
                      </button>
                      <span className={styles.pageInfo}>
                        Page {appHistoryData.pagination.page} of {appHistoryData.pagination.totalPages}
                      </span>
                      <button
                        className={styles.pageBtn}
                        disabled={!appHistoryData.pagination.hasMore || appHistoryLoading}
                        onClick={() => setAppHistoryPage((p) => p + 1)}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: COMMUNICATION HISTORY */}
        {activeTab === 'communications' && (
          <div className={styles.drawerContent}>
            {/* Header & Sub-filters */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                  Communication & Visit Logs ({commHistoryData?.pagination?.totalCount || 0})
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                {[
                  { key: 'all', label: 'All Touchpoints' },
                  { key: 'visit', label: '📍 In-Person Visits' },
                  { key: 'call', label: '📞 Phone Calls' },
                  { key: 'email', label: '✉️ Emails / Other' },
                ].map((tf) => (
                  <button
                    key={tf.key}
                    onClick={() => { setCommTypeFilter(tf.key as any); setCommHistoryPage(1); }}
                    style={{
                      background: commTypeFilter === tf.key ? '#2563eb' : '#1e293b',
                      color: commTypeFilter === tf.key ? '#ffffff' : '#94a3b8',
                      border: '1px solid #334155',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            </div>

            {commHistoryLoading && commHistoryPage === 1 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Loading communication history records...
              </div>
            ) : commHistoryData?.items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                No communication records found for the selected filters.
              </div>
            ) : (
              <>
                <div className={styles.tableWrapper} style={{ maxHeight: '420px' }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Date & Recency</th>
                        <th>Rep Name</th>
                        <th>Type</th>
                        {!isDealerSelected && <th>Dealer / Location</th>}
                        <th>State</th>
                        <th>Outcome / Result</th>
                        <th>Notes / Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commHistoryData?.items.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() =>
                            setSelectedCommDetail({
                              ...item,
                              feedback: item.notes || item.feedback,
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          title="Click to view full touchpoint notes and discussion"
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                              {item.date ? new Date(item.date).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                            </div>
                            {item.daysAgo != null && (
                              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
                                ⏱️ {item.daysAgo === 0 ? 'Today' : `${item.daysAgo}d ago`}
                              </span>
                            )}
                          </td>
                          <td style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap' }}>{item.repName || '—'}</td>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: item.type?.toLowerCase().includes('visit') || item.type?.toLowerCase().includes('meeting')
                                ? 'rgba(56, 189, 248, 0.2)'
                                : item.type?.toLowerCase().includes('call')
                                ? 'rgba(168, 85, 247, 0.2)'
                                : 'rgba(148, 163, 184, 0.2)',
                              color: item.type?.toLowerCase().includes('visit') || item.type?.toLowerCase().includes('meeting')
                                ? '#38bdf8'
                                : item.type?.toLowerCase().includes('call')
                                ? '#c084fc'
                                : '#cbd5e1',
                              border: '1px solid rgba(255,255,255,0.1)',
                            }}>
                              {item.type || 'Touchpoint'}
                            </span>
                          </td>
                          {!isDealerSelected && (
                            <td>
                              <div
                                style={{ fontWeight: 600, color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectDealer({
                                    _id: item.clientDealerId || '',
                                    dealerName: item.dealerName || '',
                                    dealerId: item.clientDealerId || '',
                                    clientDealerId: item.clientDealerId || '',
                                    statePrefix: item.state || ''
                                  });
                                }}
                                title={`Click to view DRD Profile & Analytics for ${item.dealerName}`}
                              >
                                {item.dealerName || '—'}
                              </div>
                              {item.groupName && (
                                <span style={{ fontSize: '10px', color: '#94a3b8', display: 'block' }}>
                                  {item.groupName}
                                </span>
                              )}
                            </td>
                          )}
                          <td>{item.state || '—'}</td>
                          <td style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', maxWidth: '180px' }}>
                            {item.result || '—'}
                          </td>
                          <td style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '300px' }}>
                            {item.notes && item.notes !== item.result ? item.notes : (item.feedback || '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {commHistoryData?.pagination && commHistoryData.pagination.totalPages > 1 && (
                  <div className={styles.paginationRow}>
                    <button
                      className={styles.pageBtn}
                      disabled={commHistoryPage <= 1 || commHistoryLoading}
                      onClick={() => setCommHistoryPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <span className={styles.pageInfo}>
                      Page {commHistoryData.pagination.page} of {commHistoryData.pagination.totalPages}
                    </span>
                    <button
                      className={styles.pageBtn}
                      disabled={!commHistoryData.pagination.hasMore || commHistoryLoading}
                      onClick={() => setCommHistoryPage((p) => p + 1)}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Application Detail Modal/Drawer */}
        <ApplicationDetailDrawer
          app={selectedAppDetail}
          onClose={() => setSelectedAppDetail(null)}
        />

        {/* Communication Detail Modal */}
        <CommunicationDetailModal
          comm={selectedCommDetail}
          onClose={() => setSelectedCommDetail(null)}
        />
      </div>
    </div>
  );
}
