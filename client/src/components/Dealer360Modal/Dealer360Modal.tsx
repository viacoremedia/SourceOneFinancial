import { useState, useEffect, useMemo } from 'react';
import { useAnalyticsContext } from '../../core/contexts/AnalyticsContext';
import {
  getDealer360,
  getDealer360Timeline,
  getRepCommunicationHistory,
  getDealerApplicationsHistory,
  getDealerRelationshipTimeline,
} from '../../core/services/api';
import type {
  Dealer360Response,
  Dealer360TimelineResponse,
  RepCommunicationHistoryResponse,
  RelationshipDemandTimelineResponse,
} from '../../core/services/api';
import styles from './Dealer360Modal.module.css';

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysColor(days: number | null): string {
  if (days == null) return '#64748b';
  if (days <= 30) return '#34d399';
  if (days <= 60) return '#fbbf24';
  if (days <= 90) return '#f97316';
  return '#ef4444';
}

function statusBadgeStyle(status: string) {
  switch (status) {
    case 'active':
      return { background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' };
    case '30d_inactive':
      return { background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' };
    case '60d_inactive':
      return { background: 'rgba(249, 115, 22, 0.15)', color: '#f97316', border: '1px solid rgba(249, 115, 22, 0.3)' };
    case 'long_inactive':
      return { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' };
    default:
      return { background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.3)' };
  }
}

export function Dealer360Modal() {
  const {
    focusedDealerId,
    focusedDealerName,
    focusedVisitDate,
    dealer360Open,
    dealer360InitialTab,
    closeDealer360,
    setFocusedRep,
  } = useAnalyticsContext();

  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'mom' | 'touchpoints' | 'apps'>('overview');
  const [timelineFilter, setTimelineFilter] = useState<'all' | 'visits' | 'apps' | 'booked'>('all');
  const [showOlderHistory, setShowOlderHistory] = useState<boolean>(false);
  const [overviewData, setOverviewData] = useState<Dealer360Response | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);

  // Lazy Loaded States
  const [timelineData, setTimelineData] = useState<Dealer360TimelineResponse | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState<boolean>(false);

  const [touchpointsData, setTouchpointsData] = useState<RepCommunicationHistoryResponse | null>(null);
  const [loadingTouchpoints, setLoadingTouchpoints] = useState<boolean>(false);

  const [appsData, setAppsData] = useState<any | null>(null);
  const [loadingApps, setLoadingApps] = useState<boolean>(false);

  const [drdData, setDrdData] = useState<RelationshipDemandTimelineResponse | null>(null);

  // Sync initial tab on open
  useEffect(() => {
    if (dealer360Open) {
      setActiveTab(dealer360InitialTab === 'overview' ? 'overview' : 'timeline');
    }
  }, [dealer360Open, dealer360InitialTab]);

  // Fetch Overview Data on Open
  useEffect(() => {
    if (!dealer360Open || !focusedDealerId) return;

    setLoadingOverview(true);
    setOverviewData(null);
    setTimelineData(null);
    setTouchpointsData(null);
    setAppsData(null);
    setDrdData(null);

    getDealer360(focusedDealerId)
      .then(setOverviewData)
      .catch(console.error)
      .finally(() => setLoadingOverview(false));

    getDealerRelationshipTimeline(focusedDealerId)
      .then(setDrdData)
      .catch(console.error);
  }, [dealer360Open, focusedDealerId]);

  // Lazy Load Tabs
  useEffect(() => {
    if (!dealer360Open || !focusedDealerId) return;

    if (activeTab === 'timeline' && !timelineData && !loadingTimeline) {
      setLoadingTimeline(true);
      getDealer360Timeline(focusedDealerId)
        .then(setTimelineData)
        .catch(console.error)
        .finally(() => setLoadingTimeline(false));
    }

    if (activeTab === 'touchpoints' && !touchpointsData && !loadingTouchpoints) {
      setLoadingTouchpoints(true);
      getRepCommunicationHistory({ dealerId: focusedDealerId, limit: 30 })
        .then(setTouchpointsData)
        .catch(console.error)
        .finally(() => setLoadingTouchpoints(false));
    }

    if (activeTab === 'apps' && !appsData && !loadingApps) {
      setLoadingApps(true);
      getDealerApplicationsHistory(focusedDealerId, 1, 30)
        .then(setAppsData)
        .catch(console.error)
        .finally(() => setLoadingApps(false));
    }
  }, [dealer360Open, focusedDealerId, activeTab, timelineData, loadingTimeline, touchpointsData, loadingTouchpoints, appsData, loadingApps]);

  const maxSparklineVal = useMemo(() => {
    if (!overviewData?.sparkline) return 1;
    const max = Math.max(...overviewData.sparkline.map((s) => s.apps), 1);
    return max;
  }, [overviewData]);

  if (!dealer360Open) return null;

  const loc = overviewData?.location;
  const displayName = loc?.dealerName || focusedDealerName || focusedDealerId || 'Dealer Inspection';

  return (
    <>
      <div className={styles.backdrop} onClick={closeDealer360} />
      <div className={styles.modalWrapper}>
        <div className={styles.card}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.titleRow}>
                <h2 className={styles.dealerTitle}>🏢 {displayName}</h2>
                {overviewData?.status && (
                  <span
                    className={styles.statusBadge}
                    style={statusBadgeStyle(overviewData.status)}
                  >
                    {overviewData.status.replace('_', ' ')}
                  </span>
                )}
                {drdData?.profile?.relationshipDemand && (
                  <span
                    className={styles.statusBadge}
                    style={{
                      background: drdData.profile.relationshipDemand === 'high_tlc' ? 'rgba(239, 68, 68, 0.18)' :
                        drdData.profile.relationshipDemand === 'self_sufficient' ? 'rgba(16, 185, 129, 0.18)' :
                        drdData.profile.relationshipDemand === 'unresponsive' ? 'rgba(249, 115, 22, 0.18)' :
                        'rgba(148, 163, 184, 0.18)',
                      color: drdData.profile.relationshipDemand === 'high_tlc' ? '#ef4444' :
                        drdData.profile.relationshipDemand === 'self_sufficient' ? '#10b981' :
                        drdData.profile.relationshipDemand === 'unresponsive' ? '#f97316' :
                        '#94a3b8',
                      border: '1px solid currentColor'
                    }}
                  >
                    {drdData.profile.relationshipDemand === 'high_tlc' ? '🔴 High TLC' :
                     drdData.profile.relationshipDemand === 'self_sufficient' ? '🟢 Autonomous' :
                     drdData.profile.relationshipDemand === 'unresponsive' ? '🟠 Unresponsive' :
                     '⚪ Insufficient Data'}
                  </span>
                )}
              </div>
              <div className={styles.subMeta}>
                {loc?.clientDealerId && <span>ID: <strong>{loc.clientDealerId}</strong></span>}
                {loc?.statePrefix && <span>State: <strong>{loc.statePrefix}</strong></span>}
                {loc?.repName && (
                  <span>
                    Rep:{' '}
                    <strong
                      style={{ color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                      onClick={() => {
                        setFocusedRep(loc.repName);
                        closeDealer360();
                      }}
                      title={`Filter dashboard to ${loc.repName}`}
                    >
                      {loc.repName}
                    </strong>
                  </span>
                )}
                {loc?.groupName && <span>Group: <strong>{loc.groupName}</strong></span>}
              </div>
            </div>
            <button className={styles.closeBtn} onClick={closeDealer360} title="Close">✕</button>
          </div>

          {/* Tab Navigation */}
          <div className={styles.tabBar}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              📊 Overview
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'timeline' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('timeline')}
            >
              ⏱️ Cause & Effect Timeline
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'mom' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('mom')}
            >
              📈 Monthly Trends (MoM)
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'touchpoints' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('touchpoints')}
            >
              📍 Touchpoints & Visits
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'apps' ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab('apps')}
            >
              📑 Application Stream
            </button>
          </div>

          {/* Modal Body */}
          <div className={styles.body}>
            {loadingOverview && (
              <div className={styles.spinner}>
                <span>Loading 360° Inspection Data...</span>
              </div>
            )}

            {!loadingOverview && overviewData && (
              <>
                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div>
                    {/* Recency Grid */}
                    <div className={styles.recencyGrid}>
                      <div className={styles.recencyCard}>
                        <span className={styles.recencyLabel}>Days Since App</span>
                        <span className={styles.recencyVal} style={{ color: daysColor(overviewData.recencies.daysSinceApp) }}>
                          {overviewData.recencies.daysSinceApp != null ? `${overviewData.recencies.daysSinceApp}d` : '—'}
                        </span>
                      </div>
                      <div className={styles.recencyCard}>
                        <span className={styles.recencyLabel}>Days Since Approval</span>
                        <span className={styles.recencyVal} style={{ color: daysColor(overviewData.recencies.daysSinceApproval) }}>
                          {overviewData.recencies.daysSinceApproval != null ? `${overviewData.recencies.daysSinceApproval}d` : '—'}
                        </span>
                      </div>
                      <div className={styles.recencyCard}>
                        <span className={styles.recencyLabel}>Days Since Booking</span>
                        <span className={styles.recencyVal} style={{ color: daysColor(overviewData.recencies.daysSinceBooking) }}>
                          {overviewData.recencies.daysSinceBooking != null ? `${overviewData.recencies.daysSinceBooking}d` : '—'}
                        </span>
                      </div>
                      <div className={styles.recencyCard}>
                        <span className={styles.recencyLabel}>Days Since Visit</span>
                        <span className={styles.recencyVal} style={{ color: daysColor(overviewData.recencies.daysSinceVisit) }}>
                          {overviewData.recencies.daysSinceVisit != null ? `${overviewData.recencies.daysSinceVisit}d` : '—'}
                        </span>
                      </div>
                      <div className={styles.recencyCard} style={{ background: 'rgba(52, 211, 153, 0.08)', borderColor: 'rgba(52, 211, 153, 0.3)' }}>
                        <span className={styles.recencyLabel} style={{ color: '#34d399' }}>Visit ➔ Next App</span>
                        <span className={styles.recencyVal} style={{ color: '#34d399' }}>
                          {overviewData.recencies.daysVisitToNextApp != null ? `${overviewData.recencies.daysVisitToNextApp}d` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Stats Grid */}
                    <div className={styles.statsGrid}>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Total Apps</span>
                        <span className={styles.statVal}>{overviewData.stats.totalApps}</span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Booked Volume</span>
                        <span className={styles.statVal} style={{ color: '#34d399' }}>
                          {formatDollar(overviewData.stats.totalBookedDollars)}
                        </span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Look-to-Book</span>
                        <span className={styles.statVal} style={{ color: '#38bdf8' }}>
                          {overviewData.stats.lookToBookPct}%
                        </span>
                      </div>
                      <div className={styles.statCard}>
                        <span className={styles.statLabel}>Approval-to-Book</span>
                        <span className={styles.statVal} style={{ color: '#fbbf24' }}>
                          {overviewData.stats.approvalToBookPct}%
                        </span>
                      </div>
                    </div>

                    {/* 12-Month Sparkline */}
                    <div className={styles.sparklineSection}>
                      <div className={styles.sparklineHeader}>
                        <span>12-Month Submission Velocity</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Apps per month</span>
                      </div>
                      <div className={styles.sparklineBars}>
                        {overviewData.sparkline.map((s) => {
                          const pct = Math.round((s.apps / maxSparklineVal) * 100);
                          return (
                            <div key={s.month} className={styles.sparklineCol} title={`${s.month}: ${s.apps} apps (${formatDollar(s.bookedDollars)})`}>
                              <div className={styles.barFill} style={{ height: `${Math.max(pct, 4)}%` }} />
                              <span className={styles.sparklineLabel}>{s.month.split('-')[1]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Relationship Demand & Lifecycle DNA Card */}
                    {drdData?.profile && (
                      <div className={styles.drdCard}>
                        <div className={styles.drdHeader}>
                          <div className={styles.drdTitle}>
                            <span>🧬 Relationship DNA & Field Routing Strategy</span>
                          </div>
                          <div className={styles.drdBadgeContainer}>
                            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                              Confidence: <strong>{(drdData.profile.confidenceScore * 100).toFixed(0)}%</strong>
                            </span>
                          </div>
                        </div>

                        {/* Tactical Action Recommendation Callout */}
                        {drdData.recommendation && (
                          <div className={styles.drdRecommendationBox}>
                            {drdData.recommendation}
                          </div>
                        )}

                        {/* Key Behavioral Metrics Grid */}
                        <div className={styles.drdMetricsGrid}>
                          <div className={styles.drdMetricBox}>
                            <span className={styles.drdMetricLabel}>Visit Elasticity (Ev)</span>
                            <span className={styles.drdMetricVal} style={{ color: (drdData.profile.visitElasticity || 0) >= 2.0 ? '#ef4444' : '#10b981' }}>
                              {drdData.profile.visitElasticity != null ? `${drdData.profile.visitElasticity}x` : '—'}
                            </span>
                          </div>
                          <div className={styles.drdMetricBox}>
                            <span className={styles.drdMetricLabel}>Production Half-Life</span>
                            <span className={styles.drdMetricVal} style={{ color: '#38bdf8' }}>
                              {drdData.profile.productionHalfLifeDays ? `~${drdData.profile.productionHalfLifeDays} Days` : '—'}
                            </span>
                          </div>
                          <div className={styles.drdMetricBox}>
                            <span className={styles.drdMetricLabel}>Recommended Cadence</span>
                            <span className={styles.drdMetricVal} style={{ color: '#fbbf24' }}>
                              {drdData.profile.recommendedCadenceDays ? `${drdData.profile.recommendedCadenceDays} Days` : 'N/A'}
                            </span>
                          </div>
                          <div className={styles.drdMetricBox}>
                            <span className={styles.drdMetricLabel}>Lifetime Yield / Visit</span>
                            <span className={styles.drdMetricVal} style={{ color: '#34d399' }}>
                              {formatDollar(drdData.profile.lifetimeStats?.yieldPerVisit || 0)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: UNIFIED CAUSE & EFFECT TIMELINE */}
                {activeTab === 'timeline' && (
                  <div>
                    {loadingTimeline && <div className={styles.spinner}>Loading cause-and-effect timeline...</div>}
                    {!loadingTimeline && timelineData && (
                      <div>
                        {/* Control Bar & Filter Pills */}
                        <div className={styles.timelineControlBar}>
                          <div className={styles.timelineFilterPills}>
                            <button
                              className={`${styles.timelineFilterBtn} ${timelineFilter === 'all' ? styles.timelineFilterBtnActive : ''}`}
                              onClick={() => setTimelineFilter('all')}
                            >
                              ⚡ All Events ({timelineData.timeline.length})
                            </button>
                            <button
                              className={`${styles.timelineFilterBtn} ${timelineFilter === 'visits' ? styles.timelineFilterBtnActive : ''}`}
                              onClick={() => setTimelineFilter('visits')}
                            >
                              📍 Visits & Calls ({timelineData.totalVisits})
                            </button>
                            <button
                              className={`${styles.timelineFilterBtn} ${timelineFilter === 'apps' ? styles.timelineFilterBtnActive : ''}`}
                              onClick={() => setTimelineFilter('apps')}
                            >
                              📄 Credit Apps ({timelineData.totalApps})
                            </button>
                            <button
                              className={`${styles.timelineFilterBtn} ${timelineFilter === 'booked' ? styles.timelineFilterBtnActive : ''}`}
                              onClick={() => setTimelineFilter('booked')}
                            >
                              💰 Booked Deals ({timelineData.timeline.filter(e => e.status === 'Booked').length})
                            </button>
                          </div>

                          {focusedVisitDate && (
                            <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🎯 Anchored to Visit: <strong>{focusedVisitDate}</strong></span>
                            </div>
                          )}
                        </div>

                        {(() => {
                          const filteredTimeline = timelineData.timeline.filter((e) => {
                            if (timelineFilter === 'visits') return e.eventType === 'touchpoint';
                            if (timelineFilter === 'apps') return e.eventType === 'application';
                            if (timelineFilter === 'booked') return e.eventType === 'application' && e.status === 'Booked';
                            return true;
                          });

                          if (filteredTimeline.length === 0) {
                            return (
                              <div style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>No timeline events recorded for this dealer location.</div>
                            );
                          }

                          // Find Target / Reactivation Visit
                          const targetVisit = (focusedVisitDate && timelineData.timeline.find(e => e.eventType === 'touchpoint' && e.date && e.date.startsWith(focusedVisitDate))) ||
                            timelineData.timeline.find(e => e.eventType === 'touchpoint' && e.touchpointType === 'visit');

                          const precedingEvent = targetVisit
                            ? timelineData.timeline.find(e => e.timestamp < targetVisit.timestamp)
                            : null;

                          const inactiveDaysPreceding = (targetVisit && precedingEvent)
                            ? Math.floor((targetVisit.timestamp - precedingEvent.timestamp) / (1000 * 60 * 60 * 24))
                            : null;

                          const firstPostVisitApp = targetVisit
                            ? timelineData.timeline.find(e => e.eventType === 'application' && e.timestamp >= targetVisit.timestamp && (e.timestamp - targetVisit.timestamp) <= 60 * 24 * 60 * 60 * 1000)
                            : null;

                          const targetTimestamp = targetVisit ? targetVisit.timestamp : 0;
                          const recentItems = targetVisit ? filteredTimeline.filter(e => e.timestamp >= targetTimestamp) : filteredTimeline;
                          const olderItems = targetVisit ? filteredTimeline.filter(e => e.timestamp < targetTimestamp) : [];

                          const renderCard = (e: any) => {
                            const formattedDate = e.date
                              ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—';
                            const rawIsoDate = e.date ? e.date.split('T')[0] : '';
                            const isAnchoredVisit = focusedVisitDate && rawIsoDate === focusedVisitDate && e.eventType === 'touchpoint';

                            if (e.eventType === 'touchpoint') {
                              const isVisit = e.touchpointType === 'visit';
                              const isCall = e.touchpointType === 'call';
                              return (
                                <div
                                  key={e.id}
                                  className={`${styles.timelineItem} ${isVisit ? styles.timelineItemVisit : isCall ? styles.timelineItemCall : ''} ${isAnchoredVisit ? styles.timelineItemAnchored : ''}`}
                                >
                                  <div className={`${styles.timelineNode} ${isVisit ? styles.timelineNodeVisit : styles.timelineNodeCall}`}>
                                    {isVisit ? '📍' : '📞'}
                                  </div>
                                  <div className={styles.timelineHeader}>
                                    <span className={styles.timelineTitle}>
                                      {isVisit ? '🟢 In-Person Visit' : isCall ? '📞 Phone Call' : `💬 ${e.typeLabel}`}
                                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginLeft: '6px' }}>by {e.repName}</span>
                                      {isAnchoredVisit && (
                                        <span className={styles.targetAnchorBadge}>
                                          🎯 Target Reactivation Visit
                                        </span>
                                      )}
                                    </span>
                                    <span className={styles.timelineDate}>{formattedDate}</span>
                                  </div>
                                  {e.notes && <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '6px', lineHeight: '1.4' }}>{e.notes}</div>}
                                </div>
                              );
                            }

                            const isBooked = e.status === 'Booked';
                            return (
                              <div
                                key={e.id}
                                className={`${styles.timelineItem} ${isBooked ? styles.timelineItemBooked : styles.timelineItemApp}`}
                              >
                                <div className={`${styles.timelineNode} ${isBooked ? styles.timelineNodeBooked : styles.timelineNodeApp}`}>
                                  {isBooked ? '💰' : '📄'}
                                </div>
                                <div className={styles.timelineHeader}>
                                  <span className={styles.timelineTitle}>
                                    {isBooked ? '💰 Booked Credit Deal' : '📄 Credit Application Submitted'}
                                    <span style={{ fontSize: '12px', color: '#38bdf8', marginLeft: '6px' }}>#{e.applicationId}</span>
                                  </span>
                                  <span className={styles.timelineDate}>{formattedDate}</span>
                                </div>
                                <div className={styles.timelineMeta}>
                                  <span>Status: <strong style={{ color: isBooked ? '#34d399' : (e.status || '').includes('Approval') ? '#38bdf8' : '#ef4444' }}>{e.status}</strong></span>
                                  <span>Amount: <strong style={{ color: isBooked ? '#34d399' : '#f8fafc' }}>{e.amountFinanced ? `$${e.amountFinanced.toLocaleString()}` : '$0'}</strong></span>
                                  {e.fico && <span>FICO: <strong>{e.fico}</strong></span>}

                                  {e.attribution && targetVisit && e.timestamp >= targetVisit.timestamp && (
                                    <span className={styles.attributionBadge} title={`Visit took place on ${new Date(e.attribution.visitDate).toLocaleDateString()}`}>
                                      ⚡ {e.attribution.daysAfterVisit}d post-visit by {e.attribution.repName}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          };

                          return (
                            <div>
                              {/* Horizontal Visual Flow Sequence */}
                              {targetVisit && (
                                <div className={styles.horizontalTimelineChart}>
                                  <div className={styles.horizontalChartHeader}>
                                    <span>🗺️ Cause & Effect Flow Sequence</span>
                                    <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>Visual Milestone Axis</span>
                                  </div>
                                  <div className={styles.horizontalAxis}>
                                    {precedingEvent && (
                                      <div className={styles.horizontalNodeCard}>
                                        <span className={styles.horizontalNodeLabel}>Last Prior Activity</span>
                                        <span className={styles.horizontalNodeTitle}>
                                          {precedingEvent.eventType === 'touchpoint' ? `📍 ${precedingEvent.typeLabel}` : `📄 App #${precedingEvent.applicationId}`}
                                        </span>
                                        <span className={styles.horizontalNodeDate}>
                                          {new Date(precedingEvent.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </span>
                                      </div>
                                    )}

                                    {precedingEvent && inactiveDaysPreceding != null && (
                                      <div className={styles.horizontalConnectorGap}>
                                        ⏳ {inactiveDaysPreceding} Days Inactive
                                      </div>
                                    )}

                                    <div className={styles.horizontalNodeCard} style={{ borderColor: firstPostVisitApp ? '#34d399' : '#38bdf8', background: firstPostVisitApp ? 'rgba(6, 78, 59, 0.3)' : 'rgba(14, 165, 233, 0.15)' }}>
                                      <span className={styles.horizontalNodeLabel} style={{ color: firstPostVisitApp ? '#34d399' : '#38bdf8' }}>
                                        {firstPostVisitApp ? '🎯 Reactivation Visit' : '📍 Rep In-Person Visit'}
                                      </span>
                                      <span className={styles.horizontalNodeTitle}>by {targetVisit.repName}</span>
                                      <span className={styles.horizontalNodeDate}>
                                        {new Date(targetVisit.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                      </span>
                                    </div>

                                    {firstPostVisitApp ? (
                                      <>
                                        {firstPostVisitApp.attribution && (
                                          <div className={styles.horizontalConnectorConversion}>
                                            ⚡ {firstPostVisitApp.attribution.daysAfterVisit}d Post-Visit
                                          </div>
                                        )}
                                        <div className={styles.horizontalNodeCard} style={{ borderColor: '#fbbf24', background: 'rgba(120, 53, 15, 0.3)' }}>
                                          <span className={styles.horizontalNodeLabel} style={{ color: '#fbbf24' }}>
                                            {firstPostVisitApp.status === 'Booked' ? '💰 Deal Booked' : '📄 App Submitted'}
                                          </span>
                                          <span className={styles.horizontalNodeTitle}>
                                            {firstPostVisitApp.amountFinanced ? `$${firstPostVisitApp.amountFinanced.toLocaleString()}` : `#${firstPostVisitApp.applicationId}`}
                                          </span>
                                          <span className={styles.horizontalNodeDate}>
                                            {new Date(firstPostVisitApp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                          </span>
                                        </div>
                                      </>
                                    ) : (
                                      <div className={styles.horizontalConnectorGap} style={{ color: '#94a3b8', borderStyle: 'dashed' }}>
                                        ⏳ Awaiting Post-Visit Production
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Vertical Timeline Feed */}
                              <div className={styles.timelineContainer}>
                                {recentItems.map(renderCard)}

                                {/* Inactivity Gap Divider & Expand Older History Button */}
                                {precedingEvent && inactiveDaysPreceding != null && (
                                  <div className={styles.inactivityGapCard}>
                                    <div className={styles.inactivityGapText}>
                                      <span>⏳ Dealer was inactive for <strong>{inactiveDaysPreceding} days</strong> prior to this visit</span>
                                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                                        (Last activity was {new Date(precedingEvent.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})
                                      </span>
                                    </div>
                                    {olderItems.length > 0 && (
                                      <button className={styles.expandOlderBtn} onClick={() => setShowOlderHistory((prev) => !prev)}>
                                        {showOlderHistory ? '▲ Collapse Older History' : `🔽 View Full Older History (${olderItems.length} prior events)`}
                                      </button>
                                    )}
                                  </div>
                                )}

                                {/* Older History Items (Hidden by default unless expanded) */}
                                {showOlderHistory && olderItems.map(renderCard)}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: MONTHLY TRENDS (MOM) */}
                {activeTab === 'mom' && (
                  <div>
                    <h4 style={{ color: '#38bdf8', marginBottom: '12px' }}>Monthly Performance Breakdown</h4>
                    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#090d16', color: '#94a3b8', textAlign: 'left' }}>
                          <th style={{ padding: '10px' }}>Month</th>
                          <th style={{ padding: '10px' }}>Apps</th>
                          <th style={{ padding: '10px' }}>Booked Dollars</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overviewData.sparkline.slice().reverse().map((s) => (
                          <tr key={s.month} style={{ borderBottom: '1px solid #1e293b' }}>
                            <td style={{ padding: '10px', fontWeight: 600 }}>{s.month}</td>
                            <td style={{ padding: '10px', color: '#f8fafc' }}>{s.apps}</td>
                            <td style={{ padding: '10px', color: s.bookedDollars > 0 ? '#34d399' : '#64748b', fontWeight: 600 }}>
                              {formatDollar(s.bookedDollars)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB 3: TOUCHPOINTS & VISITS (LAZY LOADED) */}
                {activeTab === 'touchpoints' && (
                  <div>
                    {loadingTouchpoints && <div className={styles.spinner}>Loading touchpoints & visit logs...</div>}
                    {!loadingTouchpoints && touchpointsData && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: '#94a3b8' }}>
                          <span>Total Recorded Touchpoints: <strong>{touchpointsData.pagination.totalCount}</strong></span>
                        </div>
                        {touchpointsData.items.length === 0 ? (
                          <div style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>No touchpoint logs recorded for this dealer.</div>
                        ) : (
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#090d16', color: '#94a3b8', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>Date</th>
                                <th style={{ padding: '8px' }}>Rep</th>
                                <th style={{ padding: '8px' }}>Type</th>
                                <th style={{ padding: '8px' }}>Notes / Outcome</th>
                              </tr>
                            </thead>
                            <tbody>
                              {touchpointsData.items.map((item) => {
                                const formattedDate = item.date
                                  ? new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '—';
                                const isVisit = item.type.toLowerCase().includes('visit');
                                const isCall = item.type.toLowerCase().includes('call');

                                return (
                                  <tr key={item.id} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '8px', color: '#38bdf8', whiteSpace: 'nowrap', fontWeight: 600 }}>{formattedDate}</td>
                                    <td style={{ padding: '8px', fontWeight: 600 }}>{item.repName}</td>
                                    <td style={{ padding: '8px' }}>
                                      <span style={{
                                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                                        background: isVisit ? 'rgba(52, 211, 153, 0.15)' : isCall ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                                        color: isVisit ? '#34d399' : isCall ? '#38bdf8' : '#cbd5e1',
                                        border: `1px solid ${isVisit ? 'rgba(52, 211, 153, 0.3)' : isCall ? 'rgba(56, 189, 248, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`
                                      }}>
                                        {isVisit ? '🟢 In-Person Visit' : isCall ? '📞 Phone Call' : item.type}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px', color: '#cbd5e1' }}>{item.result || (item as any).notes || item.feedback || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: APPLICATION STREAM (LAZY LOADED) */}
                {activeTab === 'apps' && (
                  <div>
                    {loadingApps && <div className={styles.spinner}>Loading credit application stream...</div>}
                    {!loadingApps && appsData && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '13px', color: '#94a3b8' }}>
                          <span>Applications Recorded: <strong>{appsData.pagination?.totalCount || 0}</strong></span>
                        </div>
                        {(!appsData.applications || appsData.applications.length === 0) ? (
                          <div style={{ color: '#64748b', padding: '24px 0', textAlign: 'center' }}>No application records found for this dealer.</div>
                        ) : (
                          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#090d16', color: '#94a3b8', textAlign: 'left' }}>
                                <th style={{ padding: '8px' }}>App ID</th>
                                <th style={{ padding: '8px' }}>Date</th>
                                <th style={{ padding: '8px' }}>Status</th>
                                <th style={{ padding: '8px' }}>Amount</th>
                                <th style={{ padding: '8px' }}>FICO</th>
                              </tr>
                            </thead>
                            <tbody>
                              {appsData.applications.map((app: any) => {
                                const rawDate = app.applicationDate || app.date;
                                const formattedAppDate = rawDate
                                  ? new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                  : '—';
                                const amt = app.amountFinanced ?? app.financedAmount ?? app.amount ?? 0;
                                const formattedAmount = amt > 0 ? `$${amt.toLocaleString()}` : '$0';
                                const ficoVal = app.fico || app.creditScore || '—';

                                return (
                                  <tr key={app.id || app.applicationId} style={{ borderBottom: '1px solid #1e293b' }}>
                                    <td style={{ padding: '8px', fontWeight: 700, color: '#38bdf8' }}>{app.applicationId}</td>
                                    <td style={{ padding: '8px', color: '#94a3b8' }}>{formattedAppDate}</td>
                                    <td style={{ padding: '8px' }}>
                                      <span style={{
                                        padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                                        background: app.status === 'Booked' ? 'rgba(52, 211, 153, 0.15)' : (app.status || '').includes('Approval') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                        color: app.status === 'Booked' ? '#34d399' : (app.status || '').includes('Approval') ? '#38bdf8' : '#ef4444'
                                      }}>
                                        {app.status || 'Pending'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px', fontWeight: 600, color: app.status === 'Booked' ? '#34d399' : '#f8fafc' }}>
                                      {formattedAmount}
                                    </td>
                                    <td style={{ padding: '8px', color: '#94a3b8' }}>{ficoVal}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
