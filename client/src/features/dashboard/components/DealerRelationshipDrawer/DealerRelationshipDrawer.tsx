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
  UserCheck
} from 'lucide-react';
import { getDealerRelationshipDrawer } from '../../../../core/services/api';
import type { RelationshipDemandDrawerResponse } from '../../../../core/services/api';
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
  const [data, setData] = useState<RelationshipDemandDrawerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'comms' | 'apps'>('overview');
  const [hoveredMonth, setHoveredMonth] = useState<any | null>(null);
  const [selectedAppDetail, setSelectedAppDetail] = useState<any | null>(null);
  const [selectedCommDetail, setSelectedCommDetail] = useState<CommunicationDetailItem | null>(null);

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
    </div>
  );
};
