import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  TrendingUp,
  Activity,
  FileText,
  MessageSquare
} from 'lucide-react';
import { getDealerRelationshipDrawer } from '../../../../core/services/api';
import type { RelationshipDemandDrawerResponse } from '../../../../core/services/api';
import { ApplicationDetailDrawer } from '../ApplicationDetailDrawer/ApplicationDetailDrawer';
import { CommunicationDetailModal, type CommunicationDetailItem } from '../../../../components/CommunicationDetailModal/CommunicationDetailModal';
import styles from './ReactivationDealerDrawer.module.css';

export interface ReactivationDealerItem {
  clientDealerId: string;
  dealerName: string;
  state?: string | null;
  groupName?: string | null;
  firstContactDate: string;
  statusAtVisit: string;
  outcome: string;
  daysToReactivation: number | null;
  reactivatedVolume: number;
  visitCount: number;
  repName?: string | null;
}

export interface ReactivationDealerDrawerProps {
  dealer: ReactivationDealerItem | null;
  isOpen: boolean;
  onClose: () => void;
  windowDays?: number;
}

function formatDollar(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export const ReactivationDealerDrawer: React.FC<ReactivationDealerDrawerProps> = ({
  dealer,
  isOpen,
  onClose,
  windowDays = 30,
}) => {
  const [data, setData] = useState<RelationshipDemandDrawerResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'applications' | 'communications'>('applications');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
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

  // Fetch drawer profile / application / comm data on open
  useEffect(() => {
    if (!isOpen || !dealer?.clientDealerId) {
      setData(null);
      return;
    }

    setLoading(true);
    getDealerRelationshipDrawer(dealer.clientDealerId)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        console.error('Failed to load dealer relationship data:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, dealer?.clientDealerId]);

  if (!isOpen || !dealer) return null;

  const outcomeClass = dealer.outcome === 'reactivated'
    ? styles.outcomeReactivated
    : dealer.outcome === 'no_response'
    ? styles.outcomeNoResponse
    : styles.outcomeMaintenance;

  const outcomeLabel = dealer.outcome === 'reactivated'
    ? `🟢 Reactivated (+${formatDollar(dealer.reactivatedVolume)})`
    : dealer.outcome === 'no_response'
    ? `🔴 No Response (${windowDays}d Window)`
    : `🟡 Maintenance`;

  const statusLabel = dealer.statusAtVisit === 'active'
    ? 'Active'
    : dealer.statusAtVisit === 'never_active'
    ? 'Never Active'
    : dealer.statusAtVisit === '60d_inactive'
    ? '60d Inactive'
    : dealer.statusAtVisit === '30d_inactive'
    ? '30d Inactive'
    : dealer.statusAtVisit.replace(/_/g, ' ');

  const formattedVisitDate = dealer.firstContactDate
    ? new Date(dealer.firstContactDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';

  // Filter relevant monthly timeline around visit date if available
  const allTimeline = data?.profile?.timelineMonthly || [];
  // Take last 8 months or months spanning the visit window
  const relevantTimeline = allTimeline.slice(-8);
  const maxApps = Math.max(1, ...(relevantTimeline.map((t) => t.appCount) || [1]));
  const maxVolume = Math.max(1000, ...(relevantTimeline.map((t) => t.bookedVolume) || [1000]));

  // Get visit month string e.g. "2026-01"
  const visitMonthKey = dealer.firstContactDate ? dealer.firstContactDate.slice(0, 7) : '';

  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawerContainer} onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.headerLeft}>
            <div className={styles.dealerTitleRow}>
              <span className={styles.dealerName}>{dealer.dealerName}</span>
              <span className={styles.dealerCodeBadge}>ID: {dealer.clientDealerId}</span>
              {dealer.state && <span className={styles.stateBadge}>{dealer.state}</span>}
              {dealer.groupName && <span className={styles.groupBadge}>{dealer.groupName}</span>}
            </div>

            <div className={styles.headerMetaRow}>
              <span className={styles.repInfo}>
                <UserCheck size={14} color="#38bdf8" />
                <span>Sales Rep: <strong>{dealer.repName || 'Assigned Rep'}</strong></span>
              </span>
            </div>

            <div className={styles.badgeGroup}>
              <span className={`${styles.outcomeBadge} ${outcomeClass}`}>
                {outcomeLabel}
              </span>
            </div>
          </div>

          <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Drawer Body */}
        <div className={styles.drawerContent}>
          {/* Key Metrics Strip */}
          <div className={styles.kpiGrid}>
            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Status Prior to Visit</span>
              <span className={styles.kpiValue} style={{ color: dealer.statusAtVisit === 'active' ? '#34d399' : '#f87171' }}>
                {statusLabel}
              </span>
              <span className={styles.kpiSub}>Dormancy benchmark</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Visit Contact Date</span>
              <span className={styles.kpiValue} style={{ color: '#38bdf8' }}>
                {formattedVisitDate}
              </span>
              <span className={styles.kpiSub}>In-person touchpoint</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Reactivation Speed</span>
              <span className={styles.kpiValue} style={{ color: dealer.daysToReactivation != null ? '#34d399' : '#94a3b8' }}>
                {dealer.daysToReactivation != null ? `${dealer.daysToReactivation} days` : 'No reaction'}
              </span>
              <span className={styles.kpiSub}>Within {windowDays}d window</span>
            </div>

            <div className={styles.kpiCard}>
              <span className={styles.kpiLabel}>Reactivated Volume</span>
              <span className={styles.kpiValue} style={{ color: dealer.reactivatedVolume > 0 ? '#34d399' : '#94a3b8' }}>
                {dealer.reactivatedVolume > 0 ? `+${formatDollar(dealer.reactivatedVolume)}` : '$0'}
              </span>
              <span className={styles.kpiSub}>Funded loan lift</span>
            </div>
          </div>

          {/* Diagnostic Context Box */}
          <div className={styles.diagnosticBox}>
            <div className={styles.diagnosticHeader}>
              <span className={styles.diagnosticTitle}>
                <Activity size={15} /> Reactivation Cause & Effect Analysis
              </span>
            </div>
            <ul className={styles.diagnosticBullets}>
              <li className={styles.diagnosticBullet}>
                <span className={styles.bulletIcon}>•</span>
                <span>
                  <strong>Visit Event:</strong> {dealer.repName || 'Sales Rep'} conducted an in-person dealer visit on <strong>{formattedVisitDate}</strong> when the dealer was in <strong>{statusLabel}</strong> status.
                </span>
              </li>
              <li className={styles.diagnosticBullet}>
                <span className={styles.bulletIcon}>•</span>
                <span>
                  <strong>Conversion Outcome:</strong> {dealer.outcome === 'reactivated' ? (
                    <>Account successfully re-engaged within <strong>{dealer.daysToReactivation} days</strong> of contact, generating new pipeline applications.</>
                  ) : dealer.outcome === 'no_response' ? (
                    <>No application or booking activity logged within the <strong>{windowDays}-day</strong> conversion window following the visit.</>
                  ) : (
                    <>Account was actively writing business at time of visit; contact classified as relationship maintenance.</>
                  )}
                </span>
              </li>
              {dealer.reactivatedVolume > 0 && (
                <li className={styles.diagnosticBullet}>
                  <span className={styles.bulletIcon}>•</span>
                  <span>
                    <strong>Economic Lift:</strong> Generated <strong>+{formatDollar(dealer.reactivatedVolume)}</strong> in closed funded loan volume during the conversion window across <strong>{dealer.visitCount}</strong> total visit(s).
                  </span>
                </li>
              )}
            </ul>
          </div>

          {/* Relevant Window Performance Timeline Chart */}
          {relevantTimeline.length > 0 && (
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span className={styles.sectionTitle}>
                    <TrendingUp size={16} color="#38bdf8" />
                    <span>Activity Timeline & Reactivation Window</span>
                  </span>
                </div>
                <div className={styles.legend}>
                  <span className={styles.legendItem}>
                    <span className={styles.dotApp} /> Apps Submitted
                  </span>
                  <span className={styles.legendItem}>
                    <span className={styles.dotBooked} /> Booked $
                  </span>
                  <span className={styles.legendItem}>
                    📍 Visit Touchpoint
                  </span>
                </div>
              </div>

              {/* Hover Stats Bar */}
              {hoveredIdx !== null && relevantTimeline[hoveredIdx] ? (
                <div className={styles.hoverMetricsBar}>
                  <strong style={{ color: '#38bdf8' }}>{relevantTimeline[hoveredIdx].monthKey}</strong>
                  {relevantTimeline[hoveredIdx].monthKey === visitMonthKey && (
                    <span style={{ background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                      📍 Visit Month
                    </span>
                  )}
                  <span>Apps: <strong style={{ color: '#ffffff' }}>{relevantTimeline[hoveredIdx].appCount}</strong></span>
                  <span>Funded Vol: <strong style={{ color: '#4ade80' }}>{formatDollar(relevantTimeline[hoveredIdx].bookedVolume)}</strong></span>
                  <span>Rep Visits: <strong style={{ color: '#f87171' }}>{relevantTimeline[hoveredIdx].visitCount}</strong></span>
                </div>
              ) : (
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontStyle: 'italic' }}>
                  Hover over any month column to inspect application volume, booked dollars, and sales visit touchpoints.
                </div>
              )}

              {/* Chart Container with Axis Labels */}
              <div className={styles.chartContainer}>
                <div className={styles.axisLabels}>
                  <span style={{ color: '#38bdf8', fontWeight: 600 }}>▲ Apps (0 – {maxApps})</span>
                  <span style={{ color: '#4ade80', fontWeight: 600 }}>Booked Vol ($0 – {formatDollar(maxVolume)}) ▲</span>
                </div>

                <div style={{ position: 'relative', width: '100%', height: 180 }}>
                  <svg width="100%" height="100%" viewBox="0 0 700 170">
                    <defs>
                      <linearGradient id="reactivationBarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.4" />
                      </linearGradient>
                      <linearGradient id="reactivationBarVisitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#60a5fa" stopOpacity="1" />
                        <stop offset="100%" stopColor="#2563eb" stopOpacity="0.7" />
                      </linearGradient>
                    </defs>

                    {/* Grid Lines */}
                    <line x1="20" y1="130" x2="680" y2="130" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    <line x1="20" y1="85" x2="680" y2="85" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                    <line x1="20" y1="40" x2="680" y2="40" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                    {/* Monthly Bars */}
                    {relevantTimeline.map((item, idx) => {
                      const colWidth = 660 / Math.max(1, relevantTimeline.length);
                      const x = 20 + idx * colWidth + colWidth / 2;
                      const appHeight = (item.appCount / maxApps) * 85;
                      const isVisitMonth = item.monthKey === visitMonthKey;
                      const isHovered = hoveredIdx === idx;

                      return (
                        <g key={item.monthKey}>
                          {/* Column hover / active background highlight */}
                          {(isHovered || isVisitMonth) && (
                            <rect
                              x={x - colWidth / 2 + 4}
                              y="15"
                              width={colWidth - 8}
                              height="115"
                              fill={isHovered ? 'rgba(255, 255, 255, 0.06)' : 'rgba(56, 189, 248, 0.08)'}
                              rx="6"
                              stroke={isHovered ? 'rgba(56, 189, 248, 0.4)' : isVisitMonth ? 'rgba(56, 189, 248, 0.25)' : 'transparent'}
                              strokeWidth="1"
                            />
                          )}

                          {/* App Column Bar */}
                          {item.appCount > 0 ? (
                            <rect
                              x={x - 14}
                              y={130 - appHeight}
                              width="28"
                              height={Math.max(3, appHeight)}
                              fill={isVisitMonth ? 'url(#reactivationBarVisitGradient)' : 'url(#reactivationBarGradient)'}
                              rx="4"
                            />
                          ) : (
                            <circle cx={x} cy={130} r="2" fill="rgba(255,255,255,0.2)" />
                          )}

                          {/* Apps Count Label above bar */}
                          {item.appCount > 0 && (
                            <text
                              x={x}
                              y={124 - appHeight}
                              fill="#ffffff"
                              fontSize="10"
                              fontWeight="700"
                              textAnchor="middle"
                            >
                              {item.appCount}
                            </text>
                          )}

                          {/* Visit Marker Pin */}
                          {(isVisitMonth || item.visitCount > 0) && (
                            <g>
                              <circle cx={x} cy={Math.max(22, 110 - appHeight)} r="10" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" strokeWidth="1.5" />
                              <text
                                x={x}
                                y={Math.max(22, 110 - appHeight) + 4}
                                fontSize="11"
                                textAnchor="middle"
                              >
                                📍
                              </text>
                            </g>
                          )}

                          {/* Month Label */}
                          <text
                            x={x}
                            y="152"
                            fill={isHovered ? '#ffffff' : isVisitMonth ? '#38bdf8' : '#94a3b8'}
                            fontSize="11"
                            fontWeight={isVisitMonth || isHovered ? '700' : '500'}
                            textAnchor="middle"
                          >
                            {item.monthKey}
                          </text>

                          {/* Invisible Full Height Mouse Hover Trigger */}
                          <rect
                            x={x - colWidth / 2}
                            y="0"
                            width={colWidth}
                            height="170"
                            fill="transparent"
                            style={{ cursor: 'pointer' }}
                            onMouseEnter={() => setHoveredIdx(idx)}
                            onMouseLeave={() => setHoveredIdx(null)}
                          />
                        </g>
                      );
                    })}

                    {/* Booked Volume Polyline with Data Nodes */}
                    {relevantTimeline.length > 1 && (
                      <>
                        <polyline
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="2.5"
                          points={relevantTimeline.map((item, idx) => {
                            const colWidth = 660 / Math.max(1, relevantTimeline.length);
                            const x = 20 + idx * colWidth + colWidth / 2;
                            const y = 130 - (item.bookedVolume / maxVolume) * 85;
                            return `${x},${y}`;
                          }).join(' ')}
                        />
                        {relevantTimeline.map((item, idx) => {
                          const colWidth = 660 / Math.max(1, relevantTimeline.length);
                          const x = 20 + idx * colWidth + colWidth / 2;
                          const y = 130 - (item.bookedVolume / maxVolume) * 85;
                          if (item.bookedVolume <= 0 && hoveredIdx !== idx) return null;
                          return (
                            <g key={`point-${item.monthKey}`}>
                              <circle
                                cx={x}
                                cy={y}
                                r={hoveredIdx === idx ? 6 : 4}
                                fill="#4ade80"
                                stroke="#0f172a"
                                strokeWidth="2"
                              />
                            </g>
                          );
                        })}
                      </>
                    )}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {/* Sub-Tabs: Recent Applications & Communications */}
          <div className={styles.sectionCard}>
            <div className={styles.tabNav}>
              <button
                className={`${styles.tabBtn} ${activeTab === 'applications' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('applications')}
              >
                <FileText size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Applications Pipeline ({data?.recentApplications?.length || 0})
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'communications' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('communications')}
              >
                <MessageSquare size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Touchpoints & Notes ({data?.recentCommunications?.length || 0})
              </button>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: '12px' }}>
                Loading pipeline activity records...
              </div>
            ) : activeTab === 'applications' ? (
              <div className={styles.subTableWrapper}>
                {data?.recentApplications && data.recentApplications.length > 0 ? (
                  <table className={styles.subTable}>
                    <thead>
                      <tr>
                        <th>App ID</th>
                        <th>App Date</th>
                        <th>Status</th>
                        <th>Amount</th>
                        <th>Lender</th>
                        <th>Collateral</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentApplications.slice(0, 10).map((app) => (
                        <tr
                          key={app.applicationId}
                          onClick={() =>
                            setSelectedAppDetail({
                              ...app,
                              dealerName: app.dealerName || dealer.dealerName,
                              clientDealerId: app.clientDealerId || dealer.clientDealerId,
                              dealerState: app.dealerState || dealer.state,
                              dealerRepresentative: app.dealerRepresentative || dealer.repName,
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          title={`Click to inspect application #${app.applicationId} full data`}
                        >
                          <td style={{ fontWeight: 600, color: '#38bdf8' }}>{app.applicationId}</td>
                          <td>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '—'}</td>
                          <td>
                            <span style={{
                              color: app.status === 'funded' || app.status === 'booked' ? '#4ade80' : app.status === 'approved' ? '#38bdf8' : '#94a3b8',
                              fontWeight: 600,
                              textTransform: 'capitalize'
                            }}>
                              {app.status}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>${(app.amountFinanced || 0).toLocaleString()}</td>
                          <td>{app.lender || '—'}</td>
                          <td>{app.collateralType || '—'} {app.collateralYear || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    No recent applications recorded during this period.
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.subTableWrapper}>
                {data?.recentCommunications && data.recentCommunications.length > 0 ? (
                  <table className={styles.subTable}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Channel</th>
                        <th>Sales Rep</th>
                        <th>Result</th>
                        <th>Meeting Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentCommunications.slice(0, 10).map((comm) => (
                        <tr
                          key={comm._id}
                          onClick={() =>
                            setSelectedCommDetail({
                              ...comm,
                              dealerName: dealer.dealerName,
                              clientDealerId: dealer.clientDealerId,
                              state: dealer.state,
                              groupName: dealer.groupName,
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          title="Click to view full touchpoint notes and details"
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>{new Date(comm.date).toLocaleDateString()}</td>
                          <td>
                            <span style={{
                              textTransform: 'capitalize',
                              color: comm.channel === 'visit' ? '#38bdf8' : '#cbd5e1',
                              fontWeight: 600
                            }}>
                              {comm.channel}
                            </span>
                          </td>
                          <td>{comm.repName}</td>
                          <td>{comm.result || '—'}</td>
                          <td style={{ maxWidth: '300px', whiteSpace: 'normal', color: '#94a3b8' }}>
                            {comm.feedback || 'No notes logged.'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    No communication touchpoints recorded for this dealer.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Application Full Detail Drawer */}
      <ApplicationDetailDrawer
        app={selectedAppDetail}
        onClose={() => setSelectedAppDetail(null)}
      />

      {/* Communication Full Detail Modal */}
      <CommunicationDetailModal
        comm={selectedCommDetail}
        onClose={() => setSelectedCommDetail(null)}
        dealerContext={{
          dealerName: dealer.dealerName,
          clientDealerId: dealer.clientDealerId,
          state: dealer.state || undefined,
          groupName: dealer.groupName || undefined,
        }}
      />
    </div>
  );
};
