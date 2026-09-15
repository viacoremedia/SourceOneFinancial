import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Hourglass,
  CheckCircle2,
  Briefcase,
  XCircle,
  Clock,
  Search,
  Zap,
  Sparkles,
  Calendar,
  Loader2,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  MapPin,
  Building2,
  Copy,
  Check,
  Shield,
  ShieldCheck,
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react';
import type { ApplicationHistoryItem } from '../../types';
import {
  getDealerApplicationsHistory,
  getUserPreferences,
  updateUserPreferences
} from '../../../../core/services/api';
import { BadgerQuickModal } from '../BadgerQuickModal/BadgerQuickModal';
import { CardFieldConfig, DEFAULT_STAGE_FIELDS } from './CardFieldConfig';
import styles from './CentralPipeline.module.css';

export interface CentralPipelineProps {
  selectedRep: string;
  onSelectRep?: (rep: string) => void;
  selectedState: string;
  onSelectState?: (state: string) => void;
  selectedGroup: string;
  onSelectGroup?: (group: string) => void;
  repList?: string[];
  stateList?: string[];
  groupList?: Array<{ name: string; slug: string }>;
  isInsideRep?: boolean;
  assignedRep?: string;
  tags: string[];
  excludeTags: string[];
  onSelectApplication: (app: ApplicationHistoryItem) => void;
  onNavigateToDealerProfile: (dealerId: string) => void;
}

interface PipelineStage {
  id: 'pending' | 'approved' | 'funded' | 'declined';
  title: string;
  icon: React.ReactNode;
  color: string;
  statusMatch: (status: string) => boolean;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'pending',
    title: 'Pending & Underwriting',
    icon: <Hourglass size={13} color="#fbbf24" />,
    color: '#fbbf24',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return (
        lower === 'pending' ||
        lower.includes('underwrit') ||
        lower.includes('review') ||
        (lower.includes('condition') && !lower.includes('approv')) ||
        lower.includes('new') ||
        lower.includes('submitted') ||
        lower.includes('in progress') ||
        lower === 'pending submission'
      );
    }
  },
  {
    id: 'approved',
    title: 'Approvals',
    icon: <CheckCircle2 size={13} color="#34d399" />,
    color: '#34d399',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return lower.includes('approv') && !lower.includes('booked') && !lower.includes('fund');
    }
  },
  {
    id: 'funded',
    title: 'Funded Deals',
    icon: <Briefcase size={13} color="#10b981" />,
    color: '#10b981',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return lower.includes('booked') || lower.includes('fund') || lower.includes('paid');
    }
  },
  {
    id: 'declined',
    title: 'Declines',
    icon: <XCircle size={13} color="#f87171" />,
    color: '#f87171',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return (
        lower.includes('declin') ||
        lower.includes('turn down') ||
        lower.includes('withdrawn') ||
        lower.includes('cancel')
      );
    }
  }
];

function formatCurrency(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return '$0';
  return `$${Math.round(val).toLocaleString()}`;
}

function formatAppDate(d?: string | null): string {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    });
  } catch {
    return '';
  }
}

function cleanLenderName(lender?: string | null): string {
  if (!lender) return 'Omni Lender';
  let clean = lender.trim();
  clean = clean.replace(/financial\s+services/i, 'Financial');
  clean = clean.replace(/financial\s+corp/i, 'Financial');
  return clean;
}

function getDaysInStage(app: ApplicationHistoryItem): number {
  const now = Date.now();
  const lowerStatus = (app.status || '').toLowerCase();

  // 1. For approved applications, measure from approvalDate if available
  if (lowerStatus.includes('approv') && app.approvalDate) {
    const diff = now - new Date(app.approvalDate).getTime();
    if (!isNaN(diff) && diff >= 0) return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // 2. For booked/funded applications, measure from bookedDate if available
  if ((lowerStatus.includes('book') || lowerStatus.includes('fund')) && app.bookedDate) {
    const diff = now - new Date(app.bookedDate).getTime();
    if (!isNaN(diff) && diff >= 0) return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // 3. Status changed timestamp
  if (app.statusChangedAt) {
    const diff = now - new Date(app.statusChangedAt).getTime();
    if (!isNaN(diff) && diff >= 0) return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  // 4. Precalculated daysAgo from applicationDate
  if (app.daysAgo != null && !isNaN(app.daysAgo)) {
    return app.daysAgo;
  }

  // 5. Raw applicationDate
  if (app.applicationDate) {
    const diff = now - new Date(app.applicationDate).getTime();
    if (!isNaN(diff) && diff >= 0) return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  return 0;
}

const CARDS_PER_BATCH = 30;

export const CentralPipeline: React.FC<CentralPipelineProps> = ({
  selectedRep,
  onSelectRep,
  selectedState,
  onSelectState,
  selectedGroup,
  onSelectGroup,
  repList,
  stateList,
  groupList,
  isInsideRep,
  assignedRep,
  tags,
  excludeTags,
  onSelectApplication,
  onNavigateToDealerProfile
}) => {
  const [apps, setApps] = useState<ApplicationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState<string>('');
  const initialNetworkAppsRef = useRef<ApplicationHistoryItem[] | null>(null);
  const [showAllTime, setShowAllTime] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<
    'stageDaysDesc' | 'dateDesc' | 'dateAsc' | 'amountDesc' | 'ficoDesc' | 'dealerAsc'
  >('dateDesc');
  const [copiedAppId, setCopiedAppId] = useState<string | null>(null);

  // Debounce search query to avoid spamming the backend during typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset cached network apps when parent scope filters change
  useEffect(() => {
    initialNetworkAppsRef.current = null;
  }, [selectedRep, selectedState, selectedGroup, tags, excludeTags]);

  // Column collapse state
  const [collapsedStages, setCollapsedStages] = useState<Record<string, boolean>>({});

  // Progressive batching per column
  const [visibleBatches, setVisibleBatches] = useState<Record<string, number>>({
    pending: CARDS_PER_BATCH,
    approved: CARDS_PER_BATCH,
    funded: CARDS_PER_BATCH,
    declined: CARDS_PER_BATCH
  });

  // User configured card fields per stage (loaded from MongoDB)
  const [cardFieldConfig, setCardFieldConfig] = useState<Record<string, string[]>>(
    DEFAULT_STAGE_FIELDS
  );
  const [configModalStage, setConfigModalStage] = useState<{ id: string; title: string } | null>(
    null
  );

  // Badger quick modal state
  const [badgerModalDealer, setBadgerModalDealer] = useState<{
    dealerId: string;
    dealerName: string;
  } | null>(null);

  // 1. Load user card field preferences from DB
  useEffect(() => {
    let isMounted = true;
    getUserPreferences()
      .then((res) => {
        if (isMounted && res?.preferences?.pipelineCardConfig) {
          setCardFieldConfig({
            ...DEFAULT_STAGE_FIELDS,
            ...res.preferences.pipelineCardConfig
          });
        }
      })
      .catch((err) => {
        console.warn('Failed to load user pipeline card preferences:', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Save updated stage fields to DB
  const handleSaveStageFields = useCallback(
    async (stageId: string, fields: string[]) => {
      const updated = {
        ...cardFieldConfig,
        [stageId]: fields
      };
      setCardFieldConfig(updated);
      try {
        await updateUserPreferences({
          pipelineCardConfig: {
            [stageId]: fields
          }
        });
      } catch (err) {
        console.error('Failed to save pipeline card preferences to server:', err);
      }
    },
    [cardFieldConfig]
  );

  // 2. Fetch central pipeline applications with server-side search requery
  useEffect(() => {
    let active = true;

    // Fast-path: if search is cleared and we already loaded network applications for this scope, restore immediately
    if (!debouncedSearchQuery && initialNetworkAppsRef.current) {
      setApps(initialNetworkAppsRef.current);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    getDealerApplicationsHistory(
      'all',
      1,
      1000,
      selectedState || undefined,
      selectedRep || undefined,
      selectedGroup || undefined,
      undefined,
      undefined,
      undefined,
      tags && tags.length > 0 ? tags : undefined,
      excludeTags && excludeTags.length > 0 ? excludeTags : undefined,
      debouncedSearchQuery || undefined
    )
      .then((res) => {
        if (active && res?.applications) {
          setApps(res.applications);
          // Cache the base unfiltered network applications for fast search reset
          if (!debouncedSearchQuery) {
            initialNetworkAppsRef.current = res.applications;
          }
        }
      })
      .catch((err: any) => {
        if (active) {
          console.error('Failed to load central pipeline applications:', err);
          setErrorMsg(err.message || 'Failed to load central pipeline');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedRep, selectedState, selectedGroup, tags, excludeTags, debouncedSearchQuery]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAppId(id);
    setTimeout(() => setCopiedAppId(null), 2000);
  };

  // 3. Search filter
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const q = searchQuery.toLowerCase().trim();
    return apps.filter((a) => {
      const appMatch = (a.applicationId || '').toLowerCase().includes(q);
      const dealerMatch = (a.dealerName || '').toLowerCase().includes(q);
      const repMatch = (a.dealerRepresentative || '').toLowerCase().includes(q);
      const lenderMatch = (a.lender || '').toLowerCase().includes(q);
      const underwriterMatch = (a.underwriter || '').toLowerCase().includes(q);
      const statusMatch = (a.status || '').toLowerCase().includes(q);
      const collateralMatch = `${a.collateralYear || ''} ${a.collateralType || ''}`
        .toLowerCase()
        .includes(q);
      return (
        appMatch ||
        dealerMatch ||
        repMatch ||
        lenderMatch ||
        underwriterMatch ||
        statusMatch ||
        collateralMatch
      );
    });
  }, [apps, searchQuery]);

  // 4. Overnight / recent movement calculation (status changed within 48h)
  const overnightMovements = useMemo(() => {
    const now = Date.now();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    return apps.filter((a) => {
      if (a.statusChangedAt) {
        const diff = now - new Date(a.statusChangedAt).getTime();
        return diff >= 0 && diff <= fortyEightHoursMs;
      }
      return false;
    });
  }, [apps]);

  const movementSummaryText = useMemo(() => {
    if (overnightMovements.length === 0) {
      return 'Pipeline Steady • No status transitions overnight across active deals';
    }
    const movedToApproved = overnightMovements.filter((a) =>
      (a.status || '').toLowerCase().includes('approv')
    );
    const movedToBooked = overnightMovements.filter(
      (a) =>
        (a.status || '').toLowerCase().includes('book') ||
        (a.status || '').toLowerCase().includes('fund')
    );
    const movedToDeclined = overnightMovements.filter((a) =>
      (a.status || '').toLowerCase().includes('declin')
    );

    const parts: string[] = [];
    if (movedToApproved.length > 0) {
      const vol = movedToApproved.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);
      parts.push(`${movedToApproved.length} approved (${formatCurrency(vol)})`);
    }
    if (movedToBooked.length > 0) {
      const vol = movedToBooked.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);
      parts.push(`${movedToBooked.length} funded (${formatCurrency(vol)})`);
    }
    if (movedToDeclined.length > 0) {
      parts.push(`${movedToDeclined.length} declined`);
    }
    if (parts.length === 0) {
      return `${overnightMovements.length} deals moved stages in the last 48 hours`;
    }
    return parts.join(', ');
  }, [overnightMovements]);

  // 5. Group filtered apps into the 4 stages with lifespan guardrails & sorting
  const stageGroups = useMemo(() => {
    const result: Record<'pending' | 'approved' | 'funded' | 'declined', ApplicationHistoryItem[]> = {
      pending: [],
      approved: [],
      funded: [],
      declined: []
    };

    for (const app of filteredApps) {
      const status = app.status || '';
      const days = getDaysInStage(app);

      let matchedStageId: 'pending' | 'approved' | 'funded' | 'declined' | null = null;
      for (const stage of PIPELINE_STAGES) {
        if (stage.statusMatch(status)) {
          matchedStageId = stage.id;
          break;
        }
      }
      if (!matchedStageId) {
        matchedStageId = 'pending';
      }

      if (!showAllTime) {
        // Lifespan guardrail 1: Pending & Underwriting capped at 60 days
        if (matchedStageId === 'pending' && days > 60) {
          continue;
        }
        // Lifespan guardrail 2: Approvals capped at 60 days
        if (matchedStageId === 'approved' && days > 60) {
          continue;
        }
        // Lifespan guardrail 3: Declines capped at 15 days
        if (matchedStageId === 'declined' && days > 15) {
          continue;
        }
      }

      result[matchedStageId].push(app);
    }

    // Apply column sorting
    const sortFn = (a: ApplicationHistoryItem, b: ApplicationHistoryItem) => {
      switch (sortBy) {
        case 'stageDaysDesc':
          return getDaysInStage(b) - getDaysInStage(a);
        case 'dateDesc': {
          const da = a.applicationDate ? new Date(a.applicationDate).getTime() : 0;
          const db = b.applicationDate ? new Date(b.applicationDate).getTime() : 0;
          return db - da;
        }
        case 'dateAsc': {
          const da = a.applicationDate ? new Date(a.applicationDate).getTime() : 0;
          const db = b.applicationDate ? new Date(b.applicationDate).getTime() : 0;
          return da - db;
        }
        case 'amountDesc':
          return (b.amountFinanced || 0) - (a.amountFinanced || 0);
        case 'ficoDesc':
          return (b.primaryFicoAuto8 || 0) - (a.primaryFicoAuto8 || 0);
        case 'dealerAsc':
          return (a.dealerName || '').localeCompare(b.dealerName || '');
        default:
          return 0;
      }
    };

    result.pending.sort(sortFn);
    result.approved.sort(sortFn);
    result.funded.sort(sortFn);
    result.declined.sort(sortFn);

    return result;
  }, [filteredApps, showAllTime, sortBy]);

  // Overall totals across active stages
  const activePipelineApps = useMemo(() => {
    return [
      ...stageGroups.pending,
      ...stageGroups.approved,
      ...stageGroups.funded,
      ...stageGroups.declined
    ];
  }, [stageGroups]);

  const totalVolume = useMemo(() => {
    return activePipelineApps.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);
  }, [activePipelineApps]);

  const toggleColumnCollapse = (stageId: string) => {
    setCollapsedStages((prev) => ({
      ...prev,
      [stageId]: !prev[stageId]
    }));
  };

  const handleLoadMoreInColumn = (stageId: string) => {
    setVisibleBatches((prev) => ({
      ...prev,
      [stageId]: (prev[stageId] || CARDS_PER_BATCH) + CARDS_PER_BATCH
    }));
  };

  // 6. Enhanced FICO Badge renderer with modern gradients
  const renderFicoBadge = (fico: number | null | undefined) => {
    if (fico == null || isNaN(fico)) {
      return (
        <span className={`${styles.ficoBadge} ${styles.ficoNone}`} title="No FICO score provided">
          <Shield size={10} />
          <span>No FICO</span>
        </span>
      );
    }
    if (fico >= 700) {
      return (
        <span className={`${styles.ficoBadge} ${styles.ficoHigh}`} title={`Prime Score (${fico})`}>
          <ShieldCheck size={11} />
          <span>{fico} FICO</span>
        </span>
      );
    }
    if (fico >= 620) {
      return (
        <span className={`${styles.ficoBadge} ${styles.ficoMid}`} title={`Near Prime Score (${fico})`}>
          <Shield size={11} />
          <span>{fico} FICO</span>
        </span>
      );
    }
    return (
      <span className={`${styles.ficoBadge} ${styles.ficoLow}`} title={`Subprime Score (${fico})`}>
        <AlertTriangle size={11} />
        <span>{fico} FICO</span>
      </span>
    );
  };

  // 6b. Current Granular Status badge styling
  const getStatusBadgeClass = (status: string | null | undefined) => {
    const s = (status || '').toLowerCase();
    if (s.includes('conditional')) return styles.statusConditional;
    if (s.includes('auto approval') || s === 'approved') return styles.statusApproved;
    if (s.includes('auto decline') || s.includes('decline')) return styles.statusDeclined;
    if (s.includes('booked') || s.includes('funded')) return styles.statusFunded;
    if (s.includes('pending')) return styles.statusPending;
    return styles.statusDefault;
  };

  // 7. Render Days in Stage
  const renderStageDays = (days: number, stageId: string) => {
    if (stageId === 'approved') {
      if (days >= 50) {
        return (
          <span
            className={styles.stageDaysDanger}
            title={`${days} days since approval (Expires in ${Math.max(0, 60 - days)} days)`}
          >
            <AlertTriangle size={10} />
            <span>In Stage: {days}d (Expiring)</span>
          </span>
        );
      }
      if (days >= 40) {
        return (
          <span
            className={styles.stageDaysWarning}
            title={`${days} days since approval (60d lifespan)`}
          >
            <Clock size={10} />
            <span>In Stage: {days}d</span>
          </span>
        );
      }
      return (
        <span className={styles.stageDaysNormal} title={`${days} days in approval stage`}>
          <Clock size={10} />
          <span>In Stage: {days}d</span>
        </span>
      );
    }

    if (stageId === 'pending') {
      if (days >= 50) {
        return (
          <span
            className={styles.stageDaysDanger}
            title={`${days} days in pending review (Approaching 60d limit)`}
          >
            <AlertTriangle size={10} />
            <span>In Stage: {days}d (Aging)</span>
          </span>
        );
      }
      if (days >= 14) {
        return (
          <span className={styles.stageDaysWarning} title={`${days} days in pending review`}>
            <Clock size={10} />
            <span>In Stage: {days}d</span>
          </span>
        );
      }
      return (
        <span className={styles.stageDaysNormal} title={`${days} days in pending review`}>
          <Clock size={10} />
          <span>In Stage: {days}d</span>
        </span>
      );
    }

    if (stageId === 'declined') {
      return (
        <span
          className={styles.stageDaysDanger}
          title={`Declined ${days} days ago (15-day active window)`}
        >
          <Clock size={10} />
          <span>In Stage: {days}d</span>
        </span>
      );
    }

    return (
      <span className={styles.stageDaysNormal} title={`${days} days in funded stage`}>
        <Clock size={10} />
        <span>In Stage: {days}d</span>
      </span>
    );
  };

  // 8. Dynamic configured extra fields renderer
  const renderConfiguredFields = (app: ApplicationHistoryItem, stageId: string) => {
    const fields = cardFieldConfig[stageId] || DEFAULT_STAGE_FIELDS[stageId] || [];
    // Filter out fields already permanently displayed in header/footer rows
    const extraFields = fields.filter(
      (f) =>
        ![
          'dealerName',
          'rep',
          'fico',
          'daysInStage',
          'amountFinanced',
          'underwriter',
          'lender',
          'appDate'
        ].includes(f)
    );

    if (extraFields.length === 0) return null;

    const items = extraFields
      .map((fieldKey) => {
        let label = fieldKey;
        let value: string | null = null;

        switch (fieldKey) {
          case 'dti':
            label = 'DTI';
            value = app.dti != null ? `${app.dti}%` : null;
            break;
          case 'pti':
            label = 'PTI';
            value = app.pti != null ? `${app.pti}%` : null;
            break;
          case 'ltv':
            label = 'LTV';
            value = app.ltv != null ? `${app.ltv}%` : null;
            break;
          case 'term':
            label = 'Term';
            value = app.term ? `${app.term}m` : null;
            break;
          case 'apr':
            label = 'APR';
            value = app.apr != null ? `${app.apr}%` : null;
            break;
          case 'dealerReserve':
            label = 'Reserve';
            value =
              app.dealerReserveAmount != null
                ? formatCurrency(app.dealerReserveAmount)
                : null;
            break;
          case 'totalDown':
            label = 'Down';
            value = app.totalDown != null ? formatCurrency(app.totalDown) : null;
            break;
          case 'cashDown':
            label = 'Cash Dn';
            value = app.cashDown != null ? formatCurrency(app.cashDown) : null;
            break;
          case 'timeToBook':
            label = 'Book Time';
            value =
              app.timeToBook != null
                ? `${(app.timeToBook / 1440).toFixed(1)}d`
                : null;
            break;
          case 'timeToDecision':
            label = 'Decision';
            value =
              app.timeToDecision != null
                ? app.timeToDecision >= 1440
                  ? `${(app.timeToDecision / 1440).toFixed(1)}d`
                  : `${Math.round(app.timeToDecision / 60)}h`
                : null;
            break;
          case 'location':
            label = 'Loc';
            value =
              [app.dealerCity, app.dealerState].filter(Boolean).join(', ') || null;
            break;
          default:
            value =
              (app as any)[fieldKey] != null
                ? String((app as any)[fieldKey])
                : null;
        }

        if (!value) return null;
        return { fieldKey, label, value };
      })
      .filter((item): item is { fieldKey: string; label: string; value: string } => item !== null);

    if (items.length === 0) return null;

    return (
      <div className={styles.dynamicFieldsGrid}>
        {items.map((item) => (
          <div key={item.fieldKey} className={styles.dynamicFieldItem}>
            <span className={styles.dynamicFieldLabel}>{item.label}</span>
            <span className={styles.dynamicFieldValue}>{item.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {/* ── 1. Top Controls Bar: Summary KPIs & Search & Sort ── */}
      <div className={styles.controlsHeader}>
        <div className={styles.kpiRow}>
          <div className={styles.kpiChip}>
            <span>Total Deals:</span>
            <span className={styles.kpiVal}>{activePipelineApps.length}</span>
          </div>
          <div className={styles.kpiChip}>
            <span>Pipeline Volume:</span>
            <span className={styles.kpiVal} style={{ color: '#34d399' }}>
              {formatCurrency(totalVolume)}
            </span>
          </div>
          <div className={styles.kpiChip}>
            <span>Approved:</span>
            <span className={styles.kpiVal} style={{ color: '#38bdf8' }}>
              {stageGroups.approved.length}
            </span>
          </div>
          <div className={styles.kpiChip}>
            <span>Funded:</span>
            <span className={styles.kpiVal} style={{ color: '#10b981' }}>
              {stageGroups.funded.length}
            </span>
          </div>
          <div className={styles.kpiChip}>
            <span>Declines:</span>
            <span className={styles.kpiVal} style={{ color: '#f87171' }}>
              {stageGroups.declined.length}
            </span>
          </div>
        </div>

        <div className={styles.actionsRow}>
          {/* Sales Rep Filter */}
          {repList && repList.length > 0 && onSelectRep && (
            <select
              className={styles.filterSelect}
              value={isInsideRep && assignedRep ? assignedRep : (selectedRep || '')}
              onChange={(e) => {
                if (!isInsideRep) {
                  onSelectRep(e.target.value);
                }
              }}
              disabled={isInsideRep}
              title={isInsideRep ? `Territory locked to ${assignedRep}` : 'Filter by Sales Rep'}
              aria-label="Filter by Sales Rep"
            >
              {!isInsideRep && <option value="">All Reps</option>}
              {isInsideRep && assignedRep ? (
                <option value={assignedRep}>{assignedRep}</option>
              ) : (
                repList.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))
              )}
            </select>
          )}

          {/* State Filter */}
          {stateList && stateList.length > 0 && onSelectState && (
            <select
              className={styles.filterSelect}
              value={selectedState || ''}
              onChange={(e) => onSelectState(e.target.value)}
              title="Filter by State"
              aria-label="Filter by State"
            >
              <option value="">All States</option>
              {stateList.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          )}

          {/* Dealer Group Filter */}
          {groupList && groupList.length > 0 && onSelectGroup && (
            <select
              className={styles.filterSelect}
              value={selectedGroup || ''}
              onChange={(e) => onSelectGroup(e.target.value)}
              title="Filter by Dealer Group"
              aria-label="Filter by Dealer Group"
            >
              <option value="">All Groups</option>
              {groupList.map((g) => (
                <option key={g.slug || g.name} value={g.slug || g.name}>
                  {g.name}
                </option>
              ))}
            </select>
          )}

          {/* Column Sort Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpDown size={12} color="#94a3b8" />
            <select
              className={styles.sortSelect}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort pipeline cards"
            >
              <option value="stageDaysDesc">Sort: Urgency (Days in Stage)</option>
              <option value="dateDesc">Sort: Application Date (Newest)</option>
              <option value="dateAsc">Sort: Application Date (Oldest)</option>
              <option value="amountDesc">Sort: Loan Amount ($$$ High)</option>
              <option value="ficoDesc">Sort: FICO Score (High)</option>
              <option value="dealerAsc">Sort: Dealer Name (A-Z)</option>
            </select>
          </div>

          {/* Active / All-Time Lifespan Guardrails Toggle */}
          <button
            type="button"
            className={`${styles.filterToggleBtn} ${showAllTime ? styles.filterToggleActive : ''}`}
            onClick={() => setShowAllTime(!showAllTime)}
            title={
              showAllTime
                ? 'Currently viewing all-time historical deals. Click to re-apply 60d/15d guardrails.'
                : 'Currently viewing active deals (Pending ≤60d, Approvals ≤60d, Declines ≤15d). Click to view all-time deals.'
            }
          >
            <Clock size={12} />
            <span>{showAllTime ? 'All Time (No Limits)' : 'Active (60d/15d Guardrails)'}</span>
          </button>

          {/* Rooftop / Deal Search Box */}
          <div className={styles.searchBox}>
            <Search size={13} color="#94a3b8" />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search dealer, app ID, lender, collateral..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── 2. Overnight Pipeline Movements Funnel Banner ── */}
      <div className={styles.movementBanner}>
        <div className={styles.bannerIcon}>
          <Zap size={15} color="#38bdf8" />
        </div>
        <div className={styles.bannerContent}>
          <div className={styles.bannerTitle}>Overnight Pipeline Status Movements (Last 48 Hours)</div>
          <div className={styles.bannerSub}>{movementSummaryText}</div>
        </div>
      </div>

      {/* ── 3. Kanban Opportunity Board ── */}
      {isLoading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 0',
            gap: '8px',
            color: '#94a3b8'
          }}
        >
          <Loader2 size={18} className={styles.spin} />
          <span>Loading central opportunity pipeline across all locations...</span>
        </div>
      ) : errorMsg ? (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            padding: '14px 18px',
            borderRadius: '8px',
            fontSize: '13px'
          }}
        >
          {errorMsg}
        </div>
      ) : (
        <div className={styles.pipelineBoard}>
          {PIPELINE_STAGES.map((stage) => {
            const isCollapsed = !!collapsedStages[stage.id];
            const stageApps = stageGroups[stage.id] || [];
            const stageVol = stageApps.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);
            const visibleLimit = visibleBatches[stage.id] || CARDS_PER_BATCH;
            const displayedApps = stageApps.slice(0, visibleLimit);
            const remainingCount = stageApps.length - displayedApps.length;

            if (isCollapsed) {
              return (
                <div
                  key={stage.id}
                  className={`${styles.pipelineCol} ${styles.colCollapsed}`}
                  onClick={() => toggleColumnCollapse(stage.id)}
                  title={`Click to expand ${stage.title} column`}
                >
                  <div className={styles.colCollapsedHeader}>
                    <button
                      className={styles.colActionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleColumnCollapse(stage.id);
                      }}
                      aria-label="Expand column"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <div className={styles.colCollapsedTitle}>{stage.title}</div>
                    <span className={styles.colCountBadge}>{stageApps.length}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={stage.id} className={styles.pipelineCol}>
                {/* Column Header */}
                <div className={styles.colHeader}>
                  <div className={styles.colTitleArea}>
                    <span>{stage.icon}</span>
                    <span>{stage.title}</span>
                    <span className={styles.colCountBadge}>{stageApps.length}</span>
                  </div>

                  <div className={styles.colActionsArea}>
                    <span className={styles.colVolume}>{formatCurrency(stageVol)}</span>
                    <button
                      type="button"
                      className={styles.colActionBtn}
                      onClick={() =>
                        setConfigModalStage({ id: stage.id, title: stage.title })
                      }
                      title={`Configure visible fields for ${stage.title} cards`}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                    <button
                      type="button"
                      className={styles.colActionBtn}
                      onClick={() => toggleColumnCollapse(stage.id)}
                      title="Collapse column"
                    >
                      <ChevronLeft size={13} />
                    </button>
                  </div>
                </div>

                {/* Cards List with Progressive Batching */}
                <div className={styles.colCardsList}>
                  {stageApps.length > 0 ? (
                    <>
                      {displayedApps.map((app) => {
                        const isRecentMove = overnightMovements.some(
                          (m) => m.applicationId === app.applicationId
                        );
                        const fico = app.primaryFicoAuto8;
                        const days = getDaysInStage(app);

                        return (
                          <div
                            key={app.applicationId || app._id}
                            className={styles.oppCard}
                            onClick={() => onSelectApplication(app)}
                            title="Click card to open full Application Details drawer"
                          >
                            {/* 1. Dealer Rooftop & Quick Links Row */}
                            <div className={styles.dealerRow}>
                              <div className={styles.dealerNameGroup}>
                                <div className={styles.dealerHeaderTop}>
                                  {(app.clientDealerId || (app as any).dealerId) && (
                                    <span
                                      className={styles.dealerIdBadge}
                                      title={`Dealer ID: ${app.clientDealerId || (app as any).dealerId}`}
                                    >
                                      {app.clientDealerId || (app as any).dealerId}
                                    </span>
                                  )}
                                  {app.dealerRepresentative && (
                                    <span
                                      className={styles.repBadge}
                                      title={`Assigned Rep: ${app.dealerRepresentative}`}
                                    >
                                      {app.dealerRepresentative}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={styles.dealerName}
                                  title={app.dealerName || 'Dealership'}
                                >
                                  {app.dealerName || 'Unknown Dealer'}
                                </span>
                              </div>
                            </div>

                            {/* 2. Application ID & Amount Row */}
                            <div className={styles.cardHeader}>
                              <div className={styles.appId}>
                                <span>#{app.applicationId}</span>
                                <button
                                  type="button"
                                  className={styles.copyBtn}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    copyToClipboard(app.applicationId, app.applicationId);
                                  }}
                                  title="Copy App ID"
                                >
                                  {copiedAppId === app.applicationId ? (
                                    <Check size={11} color="#34d399" />
                                  ) : (
                                    <Copy size={11} />
                                  )}
                                </button>
                              </div>
                              <span className={styles.amount}>
                                {formatCurrency(app.amountFinanced)}
                              </span>
                            </div>

                            {/* 3. Current Granular Status Badge */}
                            {app.status && (
                              <div className={styles.statusBadgeRow}>
                                <span className={`${styles.statusBadge} ${getStatusBadgeClass(app.status)}`}>
                                  {app.status}
                                </span>
                              </div>
                            )}

                            {/* 4. Overnight Status Movement Highlight */}
                            {isRecentMove && (
                              <div className={styles.movementBadge}>
                                <Sparkles size={10} color="#fbbf24" />
                                <span>
                                  {app.previousStatus
                                    ? `Moved: ${app.previousStatus} → ${app.status}`
                                    : `Status: ${app.status}`}
                                </span>
                              </div>
                            )}

                            {/* 5. Collateral Row */}
                            <div className={styles.collateral}>
                              {app.collateralYear || ''} {app.collateralType || 'Collateral'}{' '}
                              {app.collateralNewUsed ? `(${app.collateralNewUsed})` : ''}
                            </div>

                            {/* 5. Application Date & Total Age */}
                            <div className={styles.appDateRow}>
                              <div
                                className={styles.appDateGroup}
                                title={`Application received: ${formatAppDate(app.applicationDate)}`}
                              >
                                <Calendar size={11} className={styles.dateIcon} />
                                <span className={styles.dateLabel}>Rec'd:</span>
                                <span className={styles.dateVal}>
                                  {formatAppDate(app.applicationDate) || 'N/A'}
                                </span>
                              </div>
                              {app.daysAgo != null && (
                                <span
                                  className={styles.daysAgoPill}
                                  title={`${app.daysAgo} days since application received`}
                                >
                                  {app.daysAgo}d ago
                                </span>
                              )}
                            </div>

                            {/* 6. Dynamic User-Configured Fields Grid */}
                            {renderConfiguredFields(app, stage.id)}

                            {/* 7. Lender & Enhanced FICO Gradient Row */}
                            <div className={styles.cardMetaRow}>
                              <span
                                className={styles.lenderTag}
                                title={app.lender || 'Lender'}
                              >
                                {cleanLenderName(app.lender)}
                              </span>
                              {renderFicoBadge(fico)}
                            </div>

                            {/* 8. Days in Stage & Underwriter Footer */}
                            <div className={styles.cardMetaRow}>
                              {renderStageDays(days, stage.id)}
                              {app.underwriter && (
                                <span
                                  className={styles.uwBadge}
                                  title={`Underwriter: ${app.underwriter}`}
                                >
                                  UW: {app.underwriter}
                                </span>
                              )}
                            </div>

                            {/* 9. Dedicated 50/50 Bottom Action Row: Badger Activity & Dealer Profile */}
                            <div className={styles.cardBottomActionRow}>
                              <button
                                type="button"
                                className={`${styles.cardActionBtn} ${styles.badgerActionBtn}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setBadgerModalDealer({
                                    dealerId:
                                      app.clientDealerId || (app as any).dealerId || '',
                                    dealerName: app.dealerName || 'Dealer'
                                  });
                                }}
                                title="Open Badger Maps notes, contacts & log check-in"
                              >
                                <MapPin size={12} style={{ flexShrink: 0 }} />
                                <span>Badger Activity</span>
                              </button>

                              <button
                                type="button"
                                className={`${styles.cardActionBtn} ${styles.dealerProfileActionBtn}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onNavigateToDealerProfile(
                                    app.clientDealerId || (app as any).dealerId || ''
                                  );
                                }}
                                title="Jump to Dealer 360 DRD Profile"
                              >
                                <Building2 size={12} style={{ flexShrink: 0 }} />
                                <span>Dealer Profile</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {/* Progressive Batch Load More Button */}
                      {remainingCount > 0 && (
                        <button
                          type="button"
                          className={styles.loadMoreBtn}
                          onClick={() => handleLoadMoreInColumn(stage.id)}
                        >
                          ↓ Load More Deals ({remainingCount} remaining)
                        </button>
                      )}
                    </>
                  ) : (
                    <div className={styles.emptyColumn}>No deals in this stage</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── 4. Badger Quick Modal (Triggered directly from card) ── */}
      {badgerModalDealer && (
        <BadgerQuickModal
          dealerId={badgerModalDealer.dealerId}
          dealerName={badgerModalDealer.dealerName}
          onClose={() => setBadgerModalDealer(null)}
        />
      )}

      {/* ── 5. Field Configuration Modal ── */}
      {configModalStage && (
        <CardFieldConfig
          stageId={configModalStage.id}
          stageTitle={configModalStage.title}
          activeFields={cardFieldConfig[configModalStage.id] || DEFAULT_STAGE_FIELDS[configModalStage.id]}
          onSave={handleSaveStageFields}
          onClose={() => setConfigModalStage(null)}
        />
      )}
    </div>
  );
};
