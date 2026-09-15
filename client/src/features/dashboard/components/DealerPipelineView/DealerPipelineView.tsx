import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Search,
  Loader2,
  AlertTriangle,
  Clock,
  Calendar,
  Zap,
  Sparkles,
  Inbox,
  Hourglass,
  CheckCircle2,
  Briefcase,
  XCircle,
  Users,
  CalendarClock
} from 'lucide-react';
import { DealerContactsModal } from '../DealerContactsModal/DealerContactsModal';
import { ScheduleFollowUpModal } from '../ScheduleFollowUpModal/ScheduleFollowUpModal';
import { getDealerApplicationsHistory } from '../../../../core/services/api';
import type { ApplicationHistoryItem } from '../../types';
import styles from './DealerPipelineView.module.css';

export interface DealerPipelineViewProps {
  dealerId: string;
  clientDealerId?: string;
  dealerName: string;
  statePrefix?: string;
  contacts?: Array<{
    name: string;
    title: string;
    phone: string;
    email: string;
    isPrimary?: boolean;
  }>;
  badgerData?: {
    badgerId?: number | null;
    accountName?: string | null;
  } | null;
  onSyncBadger?: () => Promise<any>;
  onSelectApplication: (app: ApplicationHistoryItem) => void;
}

interface PipelineStage {
  id: string;
  title: string;
  icon: React.ReactNode;
  statusMatch: (status: string) => boolean;
  color: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: 'new',
    title: 'New Applications',
    icon: <Inbox size={13} color="#38bdf8" />,
    color: '#38bdf8',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return lower.includes('new') || lower.includes('submitted') || lower.includes('in progress') || lower === 'pending submission';
    }
  },
  {
    id: 'pending',
    title: 'Pending & Underwriting',
    icon: <Hourglass size={13} color="#fbbf24" />,
    color: '#fbbf24',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return lower === 'pending' || lower.includes('underwrit') || lower.includes('review') || lower.includes('condition');
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
    title: 'Declines & Auto-Declines',
    icon: <XCircle size={13} color="#f87171" />,
    color: '#f87171',
    statusMatch: (s) => {
      const lower = (s || '').toLowerCase();
      return lower.includes('declin') || lower.includes('turn down') || lower.includes('withdrawn') || lower.includes('cancel');
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
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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

export const DealerPipelineView: React.FC<DealerPipelineViewProps> = ({
  dealerId,
  clientDealerId,
  dealerName,
  contacts = [],
  badgerData,
  onSyncBadger,
  onSelectApplication
}) => {
  const [apps, setApps] = useState<ApplicationHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSyncingBadger, setIsSyncingBadger] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllTime, setShowAllTime] = useState<boolean>(false);
  const [showContactsModal, setShowContactsModal] = useState<boolean>(false);
  const [showFollowUpModal, setShowFollowUpModal] = useState<boolean>(false);

  // Fetch recent applications for this dealership with race condition guard
  useEffect(() => {
    let active = true;
    if (dealerId || clientDealerId) {
      setIsLoading(true);
      setErrorMsg(null);
      setApps([]); // Clear previous dealer cards immediately
      const targetId = clientDealerId || dealerId;
      getDealerApplicationsHistory(targetId, 1, 200)
        .then((res) => {
          if (active && res?.applications) {
            setApps(res.applications);
          }
        })
        .catch((err: any) => {
          if (active) {
            console.error('Failed to load dealer pipeline applications:', err);
            setErrorMsg(err.message || 'Failed to load pipeline');
          }
        })
        .finally(() => {
          if (active) {
            setIsLoading(false);
          }
        });
    } else {
      setApps([]);
    }
    return () => {
      active = false;
    };
  }, [dealerId, clientDealerId]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(id);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSyncBadgerClick = async () => {
    if (!onSyncBadger) return;
    try {
      setIsSyncingBadger(true);
      setSyncStatusMsg(null);
      const res = await onSyncBadger();
      setSyncStatusMsg({
        text: (res?.message || 'Synced contacts from Badger').replace(/[✅❌⚠️]/g, '').trim(),
        isError: false
      });
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } catch (err: any) {
      setSyncStatusMsg({
        text: (err.message || 'Failed to sync Badger').replace(/[✅❌⚠️]/g, '').trim(),
        isError: true
      });
      setTimeout(() => setSyncStatusMsg(null), 4000);
    } finally {
      setIsSyncingBadger(false);
    }
  };

  // Filter applications by search query
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps;
    const q = searchQuery.toLowerCase().trim();
    return apps.filter((a) => {
      const appMatch = (a.applicationId || '').toLowerCase().includes(q);
      const lenderMatch = (a.lender || '').toLowerCase().includes(q);
      const underwriterMatch = (a.underwriter || '').toLowerCase().includes(q);
      const statusMatch = (a.status || '').toLowerCase().includes(q);
      const collateralMatch = `${a.collateralYear || ''} ${a.collateralType || ''}`.toLowerCase().includes(q);
      return appMatch || lenderMatch || underwriterMatch || statusMatch || collateralMatch;
    });
  }, [apps, searchQuery]);

  // Overnight / recent movement calculation (status changed within 48h)
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

  // Overnight movement stats
  const movementSummaryText = useMemo(() => {
    if (overnightMovements.length === 0) {
      return 'Pipeline Steady • No status transitions overnight across active deals';
    }
    const movedToApproved = overnightMovements.filter((a) => (a.status || '').toLowerCase().includes('approv'));
    const movedToBooked = overnightMovements.filter((a) => (a.status || '').toLowerCase().includes('book') || (a.status || '').toLowerCase().includes('fund'));
    const movedToDeclined = overnightMovements.filter((a) => (a.status || '').toLowerCase().includes('declin'));

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

  // Group filtered apps into stages with lifespan filtering rules
  const stageGroups = useMemo(() => {
    const result: Record<string, ApplicationHistoryItem[]> = {
      new: [],
      pending: [],
      approved: [],
      funded: [],
      declined: []
    };

    for (const app of filteredApps) {
      const status = app.status || '';
      const days = getDaysInStage(app);

      let matchedStageId: string | null = null;
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
        // Rule 1: Pending & Underwriting capped at 60 days
        if (matchedStageId === 'pending' && days > 60) {
          continue;
        }

        // Rule 2: Approvals have a 60-day lifespan. Exclude approvals older than 60 days.
        if (matchedStageId === 'approved' && days > 60) {
          continue;
        }

        // Rule 3: Declines are only kept for the last 15 days.
        if (matchedStageId === 'declined' && days > 15) {
          continue;
        }
      }

      result[matchedStageId].push(app);
    }
    return result;
  }, [filteredApps, showAllTime]);

  // Active pipeline totals (excluding expired approvals and old declines when filters applied)
  const activePipelineApps = useMemo(() => {
    return [
      ...stageGroups.new,
      ...stageGroups.pending,
      ...stageGroups.approved,
      ...stageGroups.funded,
      ...stageGroups.declined
    ];
  }, [stageGroups]);

  const totalVolume = useMemo(() => {
    return activePipelineApps.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);
  }, [activePipelineApps]);

  // Render color-coded days in stage badge
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
          <span className={styles.stageDaysDanger} title={`${days} days in pending review (Approaching 60d limit)`}>
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
        <span className={styles.stageDaysDanger} title={`Declined ${days} days ago (15-day active window)`}>
          <Clock size={10} />
          <span>In Stage: {days}d</span>
        </span>
      );
    }

    return (
      <span className={styles.stageDaysNormal} title={`${days} days in this stage`}>
        <Clock size={10} />
        <span>In Stage: {days}d</span>
      </span>
    );
  };

  return (
    <div className={styles.container}>
      {/* ── 1. Left Panel: Contacts & Fast Communication ── */}
      <aside className={styles.contactsSidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarTitleRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone size={13} color="#38bdf8" />
              <span className={styles.sidebarTitle} title={dealerName}>
                {dealerName ? `${dealerName} Contacts` : 'Dealer Contacts'}
              </span>
            </div>
            {contacts.length > 0 && (
              <span className={styles.contactsBadge}>{contacts.length}</span>
            )}
          </div>

          {badgerData?.badgerId && (
            <div
              className={styles.badgerTag}
              title={badgerData.accountName ? `Badger Account: ${badgerData.accountName}` : undefined}
            >
              Badger #{badgerData.badgerId}
            </div>
          )}

          {onSyncBadger && (
            <button
              type="button"
              className={styles.sidebarSyncBtn}
              onClick={handleSyncBadgerClick}
              disabled={isSyncingBadger}
              title="Pull latest contact names, phones, and emails from Badger Maps"
            >
              <RefreshCw size={11} className={isSyncingBadger ? styles.spin : ''} />
              <span>{isSyncingBadger ? 'Syncing...' : 'Sync Badger'}</span>
            </button>
          )}

          <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
            <button
              type="button"
              className={styles.sidebarSyncBtn}
              onClick={() => setShowContactsModal(true)}
              title="Manage all rooftop contacts"
              style={{
                flex: 1,
                background: 'rgba(52, 211, 153, 0.1)',
                color: '#34d399',
                borderColor: 'rgba(52, 211, 153, 0.25)'
              }}
            >
              <Users size={11} />
              <span>Contacts</span>
            </button>

            <button
              type="button"
              className={styles.sidebarSyncBtn}
              onClick={() => setShowFollowUpModal(true)}
              title="Schedule follow-up reminder"
              style={{
                flex: 1,
                background: 'rgba(251, 191, 36, 0.1)',
                color: '#fbbf24',
                borderColor: 'rgba(251, 191, 36, 0.25)'
              }}
            >
              <CalendarClock size={11} />
              <span>Follow-up</span>
            </button>
          </div>

          {syncStatusMsg && (
            <div
              className={styles.sidebarSyncMsg}
              style={{
                color: syncStatusMsg.isError ? '#f87171' : '#34d399',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {syncStatusMsg.isError ? <AlertTriangle size={11} /> : <Check size={11} />}
              <span>{syncStatusMsg.text}</span>
            </div>
          )}
        </div>

        {/* Scrollable vertical contacts list */}
        <div className={styles.sidebarContactsList}>
          {contacts.length > 0 ? (
            contacts.map((c, i) => (
              <div
                key={i}
                className={`${styles.contactCard} ${c.isPrimary ? styles.contactCardPrimary : ''}`}
              >
                <div className={styles.contactNameRow}>
                  <span className={styles.contactName} title={c.name || 'Contact'}>
                    {c.name || 'Contact'}
                  </span>
                  {c.isPrimary && <span className={styles.primaryPill}>PRIMARY</span>}
                </div>
                {c.title && <span className={styles.contactTitle}>{c.title}</span>}

                <div className={styles.contactLinks}>
                  {c.phone && (
                    <a href={`tel:${c.phone}`} className={styles.contactLink} title={`Call ${c.phone}`}>
                      <Phone size={10} />
                      <span>{c.phone}</span>
                    </a>
                  )}
                  {c.email && (
                    <div className={styles.emailRow}>
                      <a
                        href={`mailto:${c.email}`}
                        className={styles.contactLink}
                        title={`Email ${c.email}`}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <Mail size={10} />
                        <span className={styles.emailText}>{c.email}</span>
                      </a>
                      <button
                        type="button"
                        className={styles.copyBtn}
                        onClick={() => copyToClipboard(c.email, `email-${i}`)}
                        title="Copy email to clipboard"
                      >
                        {copiedField === `email-${i}` ? <Check size={10} color="#34d399" /> : <Copy size={10} />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyContacts}>
              <span>No contacts on file</span>
              {onSyncBadger && (
                <button
                  type="button"
                  className={styles.emptySyncBtn}
                  onClick={handleSyncBadgerClick}
                  disabled={isSyncingBadger}
                >
                  Sync from Badger
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── 2. Right Main Area: Full-Height Opportunity Pipeline ── */}
      <main className={styles.pipelineMain}>
        {/* Overnight Status Movements Banner */}
        <div className={styles.overnightBanner}>
          <div className={styles.bannerIcon}>
            <Zap size={16} color="#38bdf8" />
          </div>
          <div className={styles.bannerContent}>
            <div className={styles.bannerTitle}>Overnight Pipeline Status Movements</div>
            <div className={styles.bannerSub}>{movementSummaryText}</div>
          </div>
        </div>

        {/* Controls: Summary KPIs & Search */}
        <div className={styles.controlsHeader}>
          <div className={styles.kpiRow}>
            <div className={styles.kpiChip}>
              <span>Deals:</span>
              <span className={styles.kpiVal}>{activePipelineApps.length}</span>
            </div>
            <div className={styles.kpiChip}>
              <span>Total Volume:</span>
              <span className={styles.kpiVal} style={{ color: '#34d399' }}>{formatCurrency(totalVolume)}</span>
            </div>
            <div className={styles.kpiChip}>
              <span>Approved:</span>
              <span className={styles.kpiVal} style={{ color: '#38bdf8' }}>{stageGroups.approved.length}</span>
            </div>
            <div className={styles.kpiChip}>
              <span>Funded:</span>
              <span className={styles.kpiVal} style={{ color: '#10b981' }}>{stageGroups.funded.length}</span>
            </div>
            <div className={styles.kpiChip}>
              <span>Declines:</span>
              <span className={styles.kpiVal} style={{ color: '#f87171' }}>{stageGroups.declined.length}</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className={`${styles.filterToggleBtn} ${showAllTime ? styles.filterToggleActive : ''}`}
              onClick={() => setShowAllTime(!showAllTime)}
              title={showAllTime ? "Currently viewing all-time historical deals. Click to re-apply 60d/15d guardrails." : "Currently viewing active deals (Pending ≤60d, Approvals ≤60d, Declines ≤15d). Click to view all-time deals."}
            >
              <Clock size={12} />
              <span>{showAllTime ? 'All Time (No Guards)' : 'Active (60d/15d Limits)'}</span>
            </button>

            <div className={styles.searchBox}>
              <Search size={13} color="#94a3b8" />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search deals in pipeline..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Kanban Opportunity Board */}
        {isLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '8px', color: '#94a3b8' }}>
            <Loader2 size={18} className={styles.spin} />
            <span>Loading opportunity pipeline...</span>
          </div>
        ) : errorMsg ? (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '12px 16px', borderRadius: '8px', fontSize: '13px' }}>
            {errorMsg}
          </div>
        ) : (
          <div className={styles.pipelineBoard}>
            {PIPELINE_STAGES.map((stage) => {
              const stageApps = stageGroups[stage.id] || [];
              const stageVol = stageApps.reduce((acc, a) => acc + (a.amountFinanced || 0), 0);

              return (
                <div key={stage.id} className={styles.pipelineCol}>
                  <div className={styles.colHeader}>
                    <div className={styles.colTitleArea}>
                      <span>{stage.icon}</span>
                      <span>{stage.title}</span>
                      <span className={styles.colCountBadge}>{stageApps.length}</span>
                    </div>
                    <span className={styles.colVolume}>{formatCurrency(stageVol)}</span>
                  </div>

                  <div className={styles.colCardsList}>
                    {stageApps.length > 0 ? (
                      stageApps.map((app) => {
                        const isRecentMove = overnightMovements.some((m) => m.applicationId === app.applicationId);
                        const fico = app.primaryFicoAuto8;
                        const ficoClass = fico == null ? '' : fico >= 700 ? styles.ficoHigh : fico >= 620 ? styles.ficoMid : styles.ficoLow;
                        const days = getDaysInStage(app);

                        return (
                          <div
                            key={app.applicationId || app._id}
                            className={styles.oppCard}
                            onClick={() => onSelectApplication(app)}
                            title="Click to view full application details and status progression"
                          >
                            <div className={styles.cardHeader}>
                              <span className={styles.appId}>{app.applicationId}</span>
                              <span className={styles.amount}>{formatCurrency(app.amountFinanced)}</span>
                            </div>

                            {/* Recent Status Transition Badge */}
                            {isRecentMove && (
                              <div className={styles.movementBadge}>
                                <Sparkles size={11} color="#fbbf24" />
                                <span>
                                  {app.previousStatus ? `Moved: ${app.previousStatus} → ${app.status}` : `New Deal: ${app.status}`}
                                </span>
                              </div>
                            )}

                            <div className={styles.collateral}>
                              {app.collateralYear || ''} {app.collateralType || 'Collateral'} {app.collateralNewUsed ? `(${app.collateralNewUsed})` : ''}
                            </div>

                            {/* Visible Application Received Date & Total Age */}
                            <div className={styles.appDateRow}>
                              <div className={styles.appDateGroup} title={`Application received: ${formatAppDate(app.applicationDate)}`}>
                                <Calendar size={11} className={styles.dateIcon} />
                                <span className={styles.dateLabel}>Rec'd:</span>
                                <span className={styles.dateVal}>{formatAppDate(app.applicationDate) || 'N/A'}</span>
                              </div>
                              {app.daysAgo != null && (
                                <span className={styles.daysAgoPill} title={`${app.daysAgo} days since application received`}>
                                  {app.daysAgo}d ago
                                </span>
                              )}
                            </div>

                            {/* Lender and FICO Row (Never clips FICO) */}
                            <div className={styles.cardMetaRow}>
                              <span className={styles.lenderTag} title={app.lender || 'Lender'}>
                                {cleanLenderName(app.lender)}
                              </span>
                              {fico != null && (
                                <span className={`${styles.ficoBadge} ${ficoClass}`}>
                                  {fico} FICO
                                </span>
                              )}
                            </div>

                            {/* Days in stage (Color Coded) & Underwriter */}
                            <div className={styles.cardMetaRow}>
                              {renderStageDays(days, stage.id)}
                              {app.underwriter && (
                                <span className={styles.uwBadge} title={`Underwriter: ${app.underwriter}`}>
                                  UW: {app.underwriter}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className={styles.emptyColumn}>No deals in this stage</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showContactsModal && (
        <DealerContactsModal
          dealerId={clientDealerId || dealerId}
          dealerName={dealerName}
          onClose={() => setShowContactsModal(false)}
        />
      )}

      {showFollowUpModal && (
        <ScheduleFollowUpModal
          dealerId={clientDealerId || dealerId}
          dealerName={dealerName}
          clientDealerId={clientDealerId}
          onClose={() => setShowFollowUpModal(false)}
        />
      )}
    </div>
  );
};
