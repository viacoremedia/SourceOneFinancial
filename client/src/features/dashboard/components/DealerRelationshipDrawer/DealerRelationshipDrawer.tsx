import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MapPin,
  Phone,
  Mail,
  AlertTriangle,
  TrendingUp,
  Calendar,
  ShieldCheck,
  UserCheck,
  Lock,
  Unlock,
  History,
  RefreshCw,
  Skull,
  EyeOff,
  Eye,
  Copy,
  Check
} from 'lucide-react';
import { 
  getDealerRelationshipDrawer,
  overrideDealerRelationshipSegment,
  resetDealerRelationshipOverride,
  syncDealerBadger,
  setDealerSystemStatus,
  excludeDealer
} from '../../../../core/services/api';
import type { RelationshipDemandDrawerResponse } from '../../../../core/services/api';
import { useAuth } from '../../../auth/hooks/useAuth';
import { ApplicationDetailDrawer } from '../ApplicationDetailDrawer/ApplicationDetailDrawer';
import { CommunicationDetailModal, type CommunicationDetailItem } from '../../../../components/CommunicationDetailModal/CommunicationDetailModal';
import styles from './DealerRelationshipDrawer.module.css';

interface DealerRelationshipDrawerProps {
  clientDealerId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export const DealerRelationshipDrawer: React.FC<DealerRelationshipDrawerProps> = ({
  clientDealerId,
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();
  const isInsideRep = user?.role === 'inside_rep';

  const [data, setData] = useState<RelationshipDemandDrawerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'comms' | 'apps'>('overview');
  const [hoveredMonth, setHoveredMonth] = useState<any | null>(null);
  const [selectedAppDetail, setSelectedAppDetail] = useState<any | null>(null);
  const [selectedCommDetail, setSelectedCommDetail] = useState<CommunicationDetailItem | null>(null);

  // Human Reconciliation & DRD Override state
  const [overrideModalOpen, setOverrideModalOpen] = useState<boolean>(false);
  const [overrideSegment, setOverrideSegment] = useState<'high_tlc' | 'self_sufficient' | 'comfort_stop' | 'lapsed' | 'insufficient_data'>('high_tlc');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);
  const [overrideActionError, setOverrideActionError] = useState<string | null>(null);
  const [auditLogExpanded, setAuditLogExpanded] = useState<boolean>(false);

  // Badger Sync state
  const [badgerSyncing, setBadgerSyncing] = useState<boolean>(false);
  const [badgerSyncMsg, setBadgerSyncMsg] = useState<string | null>(null);

  // Lifecycle Status (Dead Dealer) modal state
  const [lifecycleModalOpen, setLifecycleModalOpen] = useState<boolean>(false);
  const [lifecycleStatus, setLifecycleStatus] = useState<'active' | 'closed' | 'bought_out' | 'no_longer_in_service'>('closed');
  const [lifecycleReason, setLifecycleReason] = useState<string>('');
  const [lifecycleSubmitting, setLifecycleSubmitting] = useState<boolean>(false);

  // Rep Excluded state
  const [isExcluded, setIsExcluded] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleSyncBadger = async () => {
    if (!clientDealerId) return;
    setBadgerSyncing(true);
    setBadgerSyncMsg(null);
    try {
      const res = await syncDealerBadger(clientDealerId);
      const matchedInfo = res.data?.matchedCode || res.data?.dealerId || clientDealerId;
      const accountInfo = res.data?.badgerAccountName ? ` ("${res.data.badgerAccountName}" / Badger ID: #${res.data?.badgerId})` : '';
      setBadgerSyncMsg(`✅ Synced ${res.data?.contacts?.length || 0} contacts for ${matchedInfo}${accountInfo}`);
      setTimeout(() => setBadgerSyncMsg(null), 5000);
      await reloadDrawerData();
    } catch (err: any) {
      setBadgerSyncMsg(`❌ ${err.message || 'Dealer not found in Badger Maps'}`);
    } finally {
      setBadgerSyncing(false);
    }
  };

  const handleSaveLifecycleStatus = async () => {
    if (!clientDealerId) return;
    setLifecycleSubmitting(true);
    try {
      await setDealerSystemStatus(clientDealerId, lifecycleStatus, lifecycleReason.trim());
      setLifecycleModalOpen(false);
      setLifecycleReason('');
      await reloadDrawerData();
    } catch (err: any) {
      alert(err.message || 'Failed to update dealer lifecycle status');
    } finally {
      setLifecycleSubmitting(false);
    }
  };

  const handleToggleExclude = async () => {
    if (!clientDealerId) return;
    try {
      const nextState = !isExcluded;
      await excludeDealer(clientDealerId, nextState);
      setIsExcluded(nextState);
      if (nextState) {
        alert(`Dealer ${clientDealerId} has been excluded from your personal portfolio view.`);
      } else {
        alert(`Dealer ${clientDealerId} has been restored to your portfolio view.`);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to toggle exclusion');
    }
  };

  const reloadDrawerData = async () => {
    if (!clientDealerId) return;
    try {
      const res = await getDealerRelationshipDrawer(clientDealerId);
      setData(res);
    } catch (err) {
      console.error('Failed to reload DRD drawer:', err);
    }
  };

  const handleSaveOverride = async () => {
    if (!clientDealerId || !data?.profile) return;
    if (!overrideReason.trim()) {
      setOverrideActionError('Please enter a reason note for the manual reconciliation audit log.');
      return;
    }
    setOverrideSubmitting(true);
    setOverrideActionError(null);
    try {
      await overrideDealerRelationshipSegment(clientDealerId, overrideSegment, overrideReason.trim());
      setOverrideModalOpen(false);
      setOverrideReason('');
      await reloadDrawerData();
    } catch (err: any) {
      setOverrideActionError(err.message || 'Failed to save DRD override.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  const handleResetOverride = async () => {
    if (!clientDealerId || !data?.profile) return;
    if (!window.confirm('Reset this dealer back to automated algorithmic calculation?')) return;
    setOverrideSubmitting(true);
    try {
      await resetDealerRelationshipOverride(clientDealerId);
      await reloadDrawerData();
    } catch (err: any) {
      alert(err.message || 'Failed to reset override.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch drawer payload on open
  useEffect(() => {
    setBadgerSyncMsg(null);
    if (!isOpen || !clientDealerId) {
      setData(null);
      return;
    }

    setLoading(true);
    setError(null);

    getDealerRelationshipDrawer(clientDealerId)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.error('Failed to load dealer relationship drawer:', err);
        setError(err.message || 'Failed to load dealer relationship profile');
      })
      .finally(() => setLoading(false));
  }, [isOpen, clientDealerId]);

  const profile = data?.profile;

  // Chart Calculations
  const timeline = profile?.timelineMonthly || [];
  const maxApps = Math.max(1, ...(timeline.length > 0 ? timeline.map((t) => t.appCount) : [1]));
  const maxVolume = Math.max(1000, ...(timeline.length > 0 ? timeline.map((t) => t.bookedVolume) : [1000]));

  const demandBadgeClass = useMemo(() => {
    switch (profile?.relationshipDemand) {
      case 'high_tlc':
        return styles.demandHighTlc;
      case 'self_sufficient':
        return styles.demandSelfSuff;
      case 'comfort_stop':
        return styles.demandComfortStop;
      case 'lapsed':
        return styles.demandLapsed || styles.demandComfortStop;
      default:
        return styles.demandDiscovery;
    }
  }, [profile?.relationshipDemand]);

  const demandLabel = useMemo(() => {
    switch (profile?.relationshipDemand) {
      case 'high_tlc':
        return '🔴 High TLC (Visit-Dependent)';
      case 'self_sufficient':
        return '🟢 Self-Sufficient (Autonomous)';
      case 'comfort_stop':
        return '🟠 Comfort Stop (Time Sink)';
      case 'lapsed':
        return '⚠️ Lapsed / Churned';
      default:
        return '⚪ Discovery Queue (Low Data)';
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

  if (!isOpen) return null;

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawerContainer} onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.dealerTitleRow}>
              <span className={styles.dealerName}>
                {profile?.dealerName || clientDealerId}
              </span>
              <span className={styles.dealerCodeBadge}>{clientDealerId}</span>
              {profile?.statePrefix && (
                <span className={styles.stateBadge}>{profile.statePrefix}</span>
              )}
            </div>

            <div className={styles.headerMetaRow}>
              <span className={styles.repInfo}>
                <UserCheck size={14} color="#38bdf8" />
                <span>Assigned Rep: <strong>{profile?.assignedRep || 'Unassigned'}</strong></span>
              </span>
            </div>

            <div className={styles.badgeGroup}>
              <span className={`${styles.demandBadge} ${demandBadgeClass}`}>
                {demandLabel}
              </span>
              {profile?.relationshipDemand === 'high_tlc' && (
                <span className={`${styles.urgencyBadge} ${urgencyBadgeClass}`}>
                  {urgencyLabel}
                </span>
              )}
              {profile?.systemStatus && profile.systemStatus !== 'active' && (
                <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize' }}>
                  🚫 {profile.systemStatus.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Quick Actions Strip */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
              <button
                className={styles.syncBadgerBtn}
                onClick={handleSyncBadger}
                disabled={badgerSyncing}
                title="Refresh contacts & notes from Badger Maps"
              >
                <RefreshCw size={13} className={badgerSyncing ? styles.spin : ''} />
                <span>{badgerSyncing ? 'Syncing...' : 'Sync Badger'}</span>
              </button>

              <button
                className={styles.lifecycleBtn}
                onClick={() => setLifecycleModalOpen(true)}
                title="Flag dealership status (Closed, Bought Out, No Longer In Service)"
              >
                <Skull size={13} />
                <span>Flag Account</span>
              </button>

              {isInsideRep && (
                <button
                  className={styles.excludeBtn}
                  onClick={handleToggleExclude}
                  title={isExcluded ? 'Restore account to your portfolio' : 'Exclude account from your portfolio'}
                >
                  {isExcluded ? <Eye size={13} /> : <EyeOff size={13} />}
                  <span>{isExcluded ? 'Include in Portfolio' : 'Exclude from Portfolio'}</span>
                </button>
              )}
            </div>
          </div>

          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        {loading ? (
          <div className={styles.drawerLoading}>
            <div className={styles.spinner} />
            <span>Analyzing dealer behavioral cycles...</span>
          </div>
        ) : error ? (
          <div className={styles.drawerLoading}>
            <AlertTriangle size={32} color="#ef4444" />
            <span style={{ color: '#ef4444' }}>{error}</span>
          </div>
        ) : profile ? (
          <div className={styles.drawerContent}>
            {/* KPI Metric Strip */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Lifetime Booked $</span>
                <span className={styles.kpiValue}>
                  {formatDollar(profile.lifetimeStats?.totalBookedVolume || 0)}
                </span>
                <span className={styles.kpiSub}>
                  {profile.lifetimeStats?.totalBookings || 0} funded loans
                </span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Post-Visit Lift</span>
                <span className={styles.kpiValue} style={{ color: (profile.postVisitBookedLiftPct || 0) >= 70 ? '#f87171' : '#34d399' }}>
                  {profile.postVisitBookedLiftPct !== null ? `${profile.postVisitBookedLiftPct}%` : 'N/A'}
                </span>
                <span className={styles.kpiSub}>
                  {(profile.postVisitBookedLiftPct || 0) >= 70 ? 'In visit envelope' : 'Organic portal flow'}
                </span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>In-Person Visits</span>
                <span className={styles.kpiValue}>
                  {profile.lifetimeStats?.totalVisits || 0}
                </span>
                <span className={styles.kpiSub}>
                  {profile.verifiedCycleCount || 0} independent clusters
                </span>
              </div>

              <div className={styles.kpiCard}>
                <span className={styles.kpiLabel}>Yield / Visit</span>
                <span className={styles.kpiValue} style={{ color: (profile.lifetimeYieldPerVisit || 0) > 50000 ? '#34d399' : '#cbd5e1' }}>
                  {formatDollar(profile.lifetimeYieldPerVisit || 0)}
                </span>
                <span className={styles.kpiSub}>
                  Per rep road trip
                </span>
              </div>
            </div>

            {/* Pipeline & Underwriting Conversion Strip */}
            {profile.pipelineStats && profile.pipelineStats.totalApplications > 0 && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px',
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Apps Submitted</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                    {profile.pipelineStats.totalApplications}
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {profile.pipelineStats.totalDeclined} declined / wdn
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Approvals</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#38bdf8' }}>
                    {profile.pipelineStats.totalApproved}
                  </div>
                  <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 500 }}>
                    {profile.pipelineStats.approvalRatePct}% approval rate
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Look-to-Book</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: profile.pipelineStats.lookToBookPct > 15 ? '#34d399' : '#f59e0b' }}>
                    {profile.pipelineStats.lookToBookPct}%
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                    {profile.pipelineStats.totalBookings} booked loans
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Top Lender / UW</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {profile.pipelineStats.topLender || 'Standard Tier'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    UW: {profile.pipelineStats.topUnderwriter || 'Assigned'}
                  </div>
                </div>
              </div>
            )}

            {/* Contacts & Badger Maps Communication Roster */}
            <div className={styles.contactsSection}>
              <div className={styles.contactsHeader}>
                <div className={styles.contactsTitle}>
                  <Phone size={15} color="#38bdf8" />
                  <span>Dealer Contacts</span>
                  {profile.contacts && profile.contacts.length > 0 && (
                    <span style={{ fontSize: '11px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '1px 7px', borderRadius: '999px', fontWeight: 600 }}>
                      {profile.contacts.length} Contacts
                    </span>
                  )}
                  {profile.badgerData?.badgerId && (
                    <span style={{ fontSize: '11px', background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', padding: '2px 8px', borderRadius: '6px' }}>
                      Badger Account: #{profile.badgerData.badgerId} {profile.badgerData.accountName ? `(${profile.badgerData.accountName})` : ''}
                    </span>
                  )}
                </div>
              </div>

              {badgerSyncMsg && (
                <div style={{ fontSize: '12px', color: badgerSyncMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>
                  {badgerSyncMsg}
                </div>
              )}

              {profile.contacts && profile.contacts.length > 0 ? (
                <div className={styles.contactsGrid}>
                  {profile.contacts.map((c: any, i: number) => (
                    <div key={i} className={`${styles.contactCard} ${c.isPrimary ? styles.contactCardPrimary : ''}`}>
                      <div className={styles.contactNameRow}>
                        <span className={styles.contactName}>{c.name || 'Contact'}</span>
                        {c.isPrimary && (
                          <span style={{ fontSize: '10px', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            PRIMARY
                          </span>
                        )}
                      </div>
                      {c.title && <div className={styles.contactTitle}>{c.title}</div>}
                      <div className={styles.contactActionRow}>
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className={styles.contactActionBtn} title={`Call ${c.phone}`}>
                            <Phone size={11} />
                            <span>{c.phone}</span>
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className={styles.contactActionBtn} title={`Email ${c.email}`}>
                            <Mail size={11} />
                            <span>{c.email}</span>
                          </a>
                        )}
                        {c.email && (
                          <button
                            className={styles.contactActionBtn}
                            onClick={() => copyToClipboard(c.email, `email_${i}`)}
                            title="Copy Email"
                          >
                            {copiedField === `email_${i}` ? <Check size={11} color="#4ade80" /> : <Copy size={11} />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic', padding: '8px 0' }}>
                  No contacts loaded yet. Click <strong>"Sync Badger"</strong> in the top header to pull contact records from Badger Maps.
                </div>
              )}
            </div>

            {/* Decision Audit Box */}
            <div className={styles.auditBox}>
              <div className={styles.auditHeader}>
                <div className={styles.auditTitle}>
                  <ShieldCheck size={16} />
                  <span>System Decision Audit</span>
                </div>
                <span className={styles.confidencePill}>
                  Confidence: {Math.round(profile.confidenceScore * 100)}%
                </span>
              </div>

              <ul className={styles.auditBullets}>
                {profile.decisionRationale && profile.decisionRationale.length > 0 ? (
                  profile.decisionRationale.map((rationale, idx) => (
                    <li key={idx} className={styles.auditBullet}>
                      <span className={styles.auditBulletIcon}>•</span>
                      <span>{rationale}</span>
                    </li>
                  ))
                ) : (
                  <li className={styles.auditBullet}>
                    <span>No decision rationale available.</span>
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
                      setOverrideSegment((profile.relationshipDemand as any) || 'high_tlc');
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
                        cursor: overrideSubmitting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {overrideSubmitting ? 'Saving...' : 'Confirm & Save Override'}
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsible Override Audit History */}
              {profile.manualOverride?.history && profile.manualOverride.history.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setAuditLogExpanded(!auditLogExpanded)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 0',
                    }}
                  >
                    <History size={13} />
                    <span>
                      {auditLogExpanded ? 'Hide' : 'Show'} Audit History Log ({profile.manualOverride.history.length})
                    </span>
                  </button>

                  {auditLogExpanded && (
                    <div
                      style={{
                        marginTop: '6px',
                        background: 'rgba(0, 0, 0, 0.3)',
                        borderRadius: '4px',
                        padding: '6px 10px',
                        fontSize: '0.72rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      {profile.manualOverride.history.map((h: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            borderBottom: idx < profile.manualOverride!.history!.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                            paddingBottom: '4px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#cbd5e1' }}>
                            <span>
                              <strong>{h.fromSegment || 'auto'} ➔ {h.toSegment}</strong> by {h.by?.name || h.by?.email || 'Manager'}
                            </span>
                            <span style={{ color: '#64748b' }}>
                              {new Date(h.at).toLocaleDateString()}
                            </span>
                          </div>
                          {h.reason && (
                            <div style={{ color: '#94a3b8', fontStyle: 'italic', marginTop: '2px' }}>
                              "{h.reason}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Visual Cause & Effect Timeline Chart */}
            <div className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <span className={styles.chartTitle}>
                  <TrendingUp size={16} color="#38bdf8" />
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
              <div style={{ position: 'relative', width: '100%', height: 220, marginTop: 8 }}>
                <svg width="100%" height="100%" viewBox="0 0 700 200" preserveAspectRatio="none">
                  {/* Grid Lines */}
                  <line x1="0" y1="160" x2="700" y2="160" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
                  <line x1="0" y1="110" x2="700" y2="110" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
                  <line x1="0" y1="60" x2="700" y2="60" stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />

                  {/* Monthly Bars & Overhead Pins */}
                  {timeline.map((item, idx) => {
                    const colWidth = 700 / Math.max(1, timeline.length);
                    const x = idx * colWidth + colWidth / 2;

                    // App Bar Height (Blue)
                    const appHeight = (item.appCount / maxApps) * 110;
                    const appY = 160 - appHeight;

                    // Booked Volume Bar Height (Green)
                    const volHeight = (item.bookedVolume / maxVolume) * 110;
                    const volY = 160 - volHeight;

                    const barW = Math.max(4, colWidth * 0.32);

                    return (
                      <g
                        key={item.monthKey}
                        onMouseEnter={() => setHoveredMonth(item)}
                        onMouseLeave={() => setHoveredMonth(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Background Hover Highlight */}
                        <rect
                          x={idx * colWidth}
                          y="10"
                          width={colWidth}
                          height="150"
                          fill={hoveredMonth?.monthKey === item.monthKey ? 'rgba(56, 189, 248, 0.08)' : 'transparent'}
                        />

                        {/* App Submissions Bar (Blue) */}
                        {item.appCount > 0 && (
                          <rect
                            x={x - barW - 1}
                            y={appY}
                            width={barW}
                            height={appHeight}
                            fill="#38bdf8"
                            opacity={0.85}
                            rx="2"
                          />
                        )}

                        {/* Booked Volume Bar (Emerald Green) */}
                        {item.bookedVolume > 0 && (
                          <rect
                            x={x + 1}
                            y={volY}
                            width={barW}
                            height={volHeight}
                            fill="#10b981"
                            opacity={0.9}
                            rx="2"
                          />
                        )}

                        {/* In-Person Visit Pin Flag Overhead 📍 */}
                        {item.visitCount > 0 && (
                          <g transform={`translate(${x}, 32)`}>
                            <circle cx="0" cy="0" r="11" fill="rgba(239, 68, 68, 0.25)" />
                            <circle cx="0" cy="0" r="7" fill="#ef4444" />
                            <text x="0" y="3" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                              {item.visitCount > 1 ? item.visitCount : '📍'}
                            </text>
                            <line x1="0" y1="7" x2="0" y2="28" stroke="#ef4444" strokeWidth="1.5" />
                          </g>
                        )}

                        {/* Month Label on X-Axis (every 2nd or 3rd month for readability) */}
                        {idx % 2 === 0 && (
                          <text
                            x={x}
                            y="180"
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="monospace"
                          >
                            {item.monthKey.slice(2)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>

                {/* Hover Tooltip Overlay */}
                {hoveredMonth && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      borderRadius: '8px',
                      padding: '8px 14px',
                      fontSize: '0.78rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                      zIndex: 10
                    }}
                  >
                    <span><strong>{hoveredMonth.monthKey}</strong></span>
                    <span style={{ color: '#38bdf8' }}>Apps: <strong>{hoveredMonth.appCount}</strong></span>
                    <span style={{ color: '#10b981' }}>Booked: <strong>{formatDollar(hoveredMonth.bookedVolume)} ({hoveredMonth.bookedCount} deals)</strong></span>
                    {hoveredMonth.visitCount > 0 && (
                      <span style={{ color: '#f87171' }}>Visits: <strong>{hoveredMonth.visitCount}</strong></span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Inner Tabs Navigation */}
            <div className={styles.innerNav}>
              <button
                className={`${styles.innerTabBtn} ${activeTab === 'overview' ? styles.innerTabActive : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Interaction Cycles ({profile.interactionCycles?.length || 0})
              </button>
              <button
                className={`${styles.innerTabBtn} ${activeTab === 'comms' ? styles.innerTabActive : ''}`}
                onClick={() => setActiveTab('comms')}
              >
                Touchpoint Log ({data?.recentCommunications?.length || 0})
              </button>
              <button
                className={`${styles.innerTabBtn} ${activeTab === 'apps' ? styles.innerTabActive : ''}`}
                onClick={() => setActiveTab('apps')}
              >
                Recent Applications ({data?.recentApplications?.length || 0})
              </button>
            </div>

            {/* Tab 1: Structured Interaction Cycles */}
            {activeTab === 'overview' && (
              <div className={styles.cyclesList}>
                {profile.interactionCycles && profile.interactionCycles.length > 0 ? (
                  profile.interactionCycles.map((cycle) => (
                    <div key={cycle.cycleNumber} className={styles.cycleCard}>
                      <div className={styles.cycleTop}>
                        <span className={styles.cycleTitle}>
                          <Calendar size={14} color="#38bdf8" />
                          <span>Cycle #{cycle.cycleNumber}</span>
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 500 }}>
                            ({new Date(cycle.startDate).toLocaleDateString()} — {new Date(cycle.endDate).toLocaleDateString()})
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '10px',
                            background: cycle.metrics.bookedInWindow > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: cycle.metrics.bookedInWindow > 0 ? '#34d399' : '#f87171',
                            border: `1px solid ${cycle.metrics.bookedInWindow > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                          }}
                        >
                          {cycle.metrics.bookedInWindow > 0 ? `+$${(cycle.metrics.bookedVolumeInWindow / 1000).toFixed(0)}K Booked` : '$0 Booked'}
                        </span>
                      </div>

                      <p className={styles.cycleSummaryText}>{cycle.summaryText}</p>

                      <div className={styles.cycleMetricsRow}>
                        <span>Visits in Cluster: <strong className={styles.cycleMetricVal}>{cycle.visitCountInCluster}</strong></span>
                        <span>Relative Lift: <strong className={styles.cycleMetricVal}>+{cycle.metrics.relativeBookedLift}x</strong></span>
                        <span>Pattern: <strong className={styles.cycleMetricVal}>{cycle.metrics.patternObserved}</strong></span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                    No recorded visit interaction cycles. Rooftop is in Discovery Queue.
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Recent Communications Log */}
            {activeTab === 'comms' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data?.recentCommunications && data.recentCommunications.length > 0 ? (
                  data.recentCommunications.map((comm) => (
                    <div
                      key={comm._id}
                      onClick={() =>
                        setSelectedCommDetail({
                          ...comm,
                          dealerName: profile?.dealerName,
                          clientDealerId: profile?.clientDealerId,
                          state: profile?.statePrefix || undefined,
                          groupName: (profile as any)?.groupName || undefined,
                        })
                      }
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title="Click to view full touchpoint notes and discussion"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {comm.channel === 'visit' ? (
                          <MapPin size={16} color="#ef4444" />
                        ) : comm.channel === 'call' ? (
                          <Phone size={16} color="#a855f7" />
                        ) : (
                          <Mail size={16} color="#38bdf8" />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: '#ffffff' }}>
                            {comm.channel.toUpperCase()} — {comm.result || 'Logged interaction'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            Rep: {comm.repName} {comm.feedback ? `• Feedback: "${comm.feedback}"` : ''}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                        {new Date(comm.date).toLocaleDateString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                    No communication history logged.
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Recent Applications Log */}
            {activeTab === 'apps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data?.recentApplications && data.recentApplications.length > 0 ? (
                  data.recentApplications.map((app) => (
                    <div
                      key={app.applicationId}
                      onClick={() =>
                        setSelectedAppDetail({
                          ...app,
                          dealerName: app.dealerName || profile?.dealerName,
                          clientDealerId: app.clientDealerId || profile?.clientDealerId,
                          dealerState: app.dealerState || profile?.statePrefix,
                          dealerRepresentative: app.dealerRepresentative || profile?.assignedRep,
                        })
                      }
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title={`Click to inspect application #${app.applicationId} full data`}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#38bdf8' }}>
                          App #{app.applicationId} {app.lender ? `— ${app.lender}` : ''}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          {app.collateralYear || ''} {app.collateralType || 'Unit'} • Financed: {formatDollar(app.amountFinanced || 0)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: app.status === 'Booked' || app.status === 'funded' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.12)',
                            color: app.status === 'Booked' || app.status === 'funded' ? '#34d399' : '#94a3b8',
                            border: `1px solid ${app.status === 'Booked' || app.status === 'funded' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`
                          }}
                        >
                          {app.status}
                        </span>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                          {app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                    No loan applications on record.
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Application Detail Drawer */}
      <ApplicationDetailDrawer
        app={selectedAppDetail}
        onClose={() => setSelectedAppDetail(null)}
      />

      {/* Communication Detail Modal */}
      <CommunicationDetailModal
        comm={selectedCommDetail}
        onClose={() => setSelectedCommDetail(null)}
        dealerContext={{
          dealerName: profile?.dealerName,
          clientDealerId: profile?.clientDealerId,
          state: profile?.statePrefix || undefined,
          groupName: (profile as any)?.groupName || undefined,
        }}
      />

      {/* Flag Lifecycle Status Modal */}
      {lifecycleModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '12px', padding: '24px', width: '460px', maxWidth: '92vw', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)' }}>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Skull size={18} color="#f87171" />
              <span>Flag Dealership Lifecycle Status</span>
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: '1.4' }}>
              Set system-wide status for <strong>{profile?.dealerName || clientDealerId}</strong>. Dead accounts (closed/bought out/out of service) are removed from all views and archived in the Admin Graveyard.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Lifecycle Status</label>
              <select
                value={lifecycleStatus}
                onChange={(e: any) => setLifecycleStatus(e.target.value)}
                style={{ background: '#1e293b', border: '1px solid #475569', color: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}
              >
                <option value="active">🟢 Active (Normal Operation)</option>
                <option value="closed">🚫 Closed Dealership</option>
                <option value="bought_out">🤝 Bought Out / Acquired</option>
                <option value="no_longer_in_service">⚠️ No Longer In Service</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 600 }}>Reason / Notes</label>
              <textarea
                value={lifecycleReason}
                onChange={(e) => setLifecycleReason(e.target.value)}
                placeholder="Details (e.g. bought out by larger group, facility permanently closed)..."
                rows={3}
                style={{ background: '#1e293b', border: '1px solid #475569', color: '#f8fafc', padding: '10px 12px', borderRadius: '8px', fontSize: '13px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                onClick={() => setLifecycleModalOpen(false)}
                style={{ background: 'transparent', border: '1px solid #475569', color: '#cbd5e1', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLifecycleStatus}
                disabled={lifecycleSubmitting}
                style={{ background: '#ef4444', border: 'none', color: '#fff', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              >
                {lifecycleSubmitting ? 'Updating...' : 'Save Lifecycle Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
