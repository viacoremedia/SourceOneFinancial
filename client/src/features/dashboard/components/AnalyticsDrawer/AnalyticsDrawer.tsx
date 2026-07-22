import { useEffect, useState, useMemo } from 'react';
import { getHistoricalMoM } from '../../../../core/services/api';
import type { HistoricalMoMItem, HistoricalMoMResponse, MetricTrend } from '../../types';
import styles from './AnalyticsDrawer.module.css';

interface AnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  availableStates?: string[];
  availableGroups?: { name: string; slug: string }[];
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

function renderBadge(trendObj?: MetricTrend) {
  if (!trendObj) return null;
  const { pct } = trendObj;
  if (pct === 0) return null;
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
  availableGroups = []
}: AnalyticsDrawerProps) {
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY BEFORE EARLY RETURNS
  const [data, setData] = useState<HistoricalMoMResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [trendMode, setTrendMode] = useState<'mom' | 'yoy'>('mom');
  const [timeframeMode, setTimeframeMode] = useState<'all' | 'ytd'>('all');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedRep, setSelectedRep] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let active = true;
    setIsLoading(true);
    getHistoricalMoM(trendMode, selectedState || undefined, selectedRep || undefined, selectedGroup || undefined)
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
  }, [isOpen, trendMode, selectedState, selectedRep, selectedGroup]);

  // Displayed months based on Timeframe Scope Toggle (All Months vs YTD Only)
  const displayedMonths = useMemo(() => {
    const list = data?.months || [];
    if (timeframeMode === 'ytd') {
      return list.filter((m) => m.year === 2026);
    }
    return list;
  }, [data, timeframeMode]);

  // Aggregate Totals across current items displayed in table/chart
  const totals = useMemo(() => {
    let apps = 0;
    let approvals = 0;
    let booked = 0;
    let bookedDollars = 0;
    let budgetTarget = 0;

    for (const m of displayedMonths) {
      apps += (m.stats?.apps || 0);
      approvals += (m.stats?.approvals || 0);
      booked += (m.stats?.booked || 0);
      bookedDollars += (m.stats?.bookedDollars || 0);
      budgetTarget += (m.budgetTarget || 0);
    }

    const lookToBook = apps > 0 ? booked / apps : 0;
    const approvalToBook = approvals > 0 ? booked / approvals : 0;
    const latestCohort = displayedMonths.length > 0 ? displayedMonths[displayedMonths.length - 1].cohorts : null;

    return {
      apps,
      approvals,
      booked,
      bookedDollars,
      lookToBook,
      approvalToBook,
      budgetTarget,
      latestCohort
    };
  }, [displayedMonths]);

  // EARLY RETURN FOR RENDER ONLY (AFTER ALL HOOKS)
  if (!isOpen) return null;

  const months = displayedMonths;

  // SVG Line Chart calculations
  const maxApps = Math.max(10, ...months.map(m => m.stats.apps || 0));
  const maxBookedDollars = Math.max(1, ...months.map(m => m.stats.bookedDollars || 0));

  const svgWidth = 800;
  const svgHeight = 180;
  const padding = 30;
  const graphW = svgWidth - padding * 2;
  const graphH = svgHeight - padding * 2;

  const pointsData = months.map((m, i) => {
    const x = padding + (i / Math.max(1, months.length - 1)) * graphW;
    const yApps = svgHeight - padding - ((m.stats.apps || 0) / maxApps) * graphH;
    const yBooked = svgHeight - padding - ((m.stats.bookedDollars || 0) / maxBookedDollars) * graphH;
    return { x, yApps, yBooked, month: m };
  });

  const appPoints = pointsData.map(p => `${p.x},${p.yApps}`).join(' ');
  const bookedPoints = pointsData.map(p => `${p.x},${p.yBooked}`).join(' ');

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Drag handle */}
        <div className={styles.dragHandleRow} onClick={onClose}>
          <div className={styles.dragHandle} />
        </div>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <span style={{ fontSize: '1.4rem' }}>📊</span>
            <div>
              <div className={styles.title}>Month-over-Month Historical Analytics</div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Jan 2025 – Present | Dealer Cohorts, Origination Metrics & Budgeting
              </div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close drawer">
            ✕
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className={styles.filterControls}>
          {/* Timeframe Scope Toggle */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Timeframe:</span>
            <div className={styles.trendToggle}>
              <button
                className={`${styles.toggleBtn} ${timeframeMode === 'all' ? styles.toggleActive : ''}`}
                onClick={() => setTimeframeMode('all')}
              >
                All Months (2025–Present)
              </button>
              <button
                className={`${styles.toggleBtn} ${timeframeMode === 'ytd' ? styles.toggleActive : ''}`}
                onClick={() => setTimeframeMode('ytd')}
              >
                YTD Only (2026)
              </button>
            </div>
          </div>

          {/* Trend Toggle */}
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
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
            >
              <option value="">All States</option>
              {availableStates.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Rep Filter */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Sales Rep:</span>
            <select
              className={styles.selectInput}
              value={selectedRep}
              onChange={(e) => setSelectedRep(e.target.value)}
            >
              <option value="">All Reps</option>
              {['Bruce', 'George', 'Janet', 'Jeff', 'John', 'Pam/Ward', 'Steve'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Dealer Group:</span>
            <select
              className={styles.selectInput}
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
            >
              <option value="">All Groups</option>
              {availableGroups.map((g) => (
                <option key={g.slug} value={g.slug}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Body */}
        <div className={styles.drawerContent}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              Loading Historical Analytics...
            </div>
          ) : (
            <>
              {/* SVG Line Chart Card */}
              <div className={styles.chartCard}>
                <div className={styles.chartHeader}>
                  <div className={styles.chartTitle}>Historical Performance Trends</div>

                  {/* Active Hover / Default Latest Month Summary Bar */}
                  {months.length > 0 && (() => {
                    const activeItem = (hoveredIndex !== null && pointsData[hoveredIndex])
                      ? pointsData[hoveredIndex]
                      : pointsData[pointsData.length - 1];

                    return (
                      <div className={styles.hoverMetricsBar}>
                        <span style={{ fontWeight: 700, color: '#60a5fa' }}>{activeItem.month.label}</span>
                        <span style={{ color: '#94a3b8' }}>|</span>
                        <span style={{ color: '#60a5fa' }}>
                          Apps: <strong>{activeItem.month.stats.apps}</strong> {renderBadge(activeItem.month.trends.apps)}
                        </span>
                        <span style={{ color: '#94a3b8' }}>|</span>
                        <span style={{ color: '#4ade80' }}>
                          Booked Volume: <strong>{formatCurrency(activeItem.month.stats.bookedDollars)}</strong> {renderBadge(activeItem.month.trends.bookedDollars)}
                        </span>
                        <span style={{ color: '#94a3b8' }}>|</span>
                        <span style={{ color: '#cbd5e1' }}>
                          Approvals: <strong>{activeItem.month.stats.approvals}</strong>
                        </span>
                        <span style={{ color: '#94a3b8' }}>|</span>
                        <span style={{ color: '#cbd5e1' }}>
                          Active: <strong>{activeItem.month.cohorts.active}</strong> ({activeItem.month.cohorts.activePct}%)
                        </span>
                      </div>
                    );
                  })()}

                  <div className={styles.legend}>
                    <div className={styles.legendItem}>
                      <span className={styles.dot} style={{ background: '#3b82f6' }} /> Apps
                    </div>
                    <div className={styles.legendItem}>
                      <span className={styles.dot} style={{ background: '#4ade80' }} /> Booked Volume ($)
                    </div>
                  </div>
                </div>

                {months.length > 0 && (() => {
                  const colW = graphW / Math.max(1, months.length - 1);
                  const activeItem = hoveredIndex !== null ? pointsData[hoveredIndex] : null;

                  return (
                    <svg
                      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                      style={{ width: '100%', height: '180px', cursor: 'pointer' }}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {/* Background Grid Lines */}
                      <line x1={padding} y1={padding} x2={svgWidth - padding} y2={padding} stroke="rgba(255,255,255,0.06)" />
                      <line x1={padding} y1={svgHeight / 2} x2={svgWidth - padding} y2={svgHeight / 2} stroke="rgba(255,255,255,0.06)" />
                      <line x1={padding} y1={svgHeight - padding} x2={svgWidth - padding} y2={svgHeight - padding} stroke="rgba(255,255,255,0.1)" />

                      {/* Booked Volume Polyline */}
                      <polyline
                        fill="none"
                        stroke="#4ade80"
                        strokeWidth="2.5"
                        points={bookedPoints}
                      />

                      {/* Apps Polyline */}
                      <polyline
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2.5"
                        points={appPoints}
                      />

                      {/* Hover Guide Line and Data Circles */}
                      {activeItem && (
                        <g>
                          <line
                            x1={activeItem.x}
                            y1={padding}
                            x2={activeItem.x}
                            y2={svgHeight - padding}
                            stroke="#94a3b8"
                            strokeDasharray="4 4"
                          />
                          <circle cx={activeItem.x} cy={activeItem.yApps} r="5" fill="#3b82f6" stroke="#ffffff" strokeWidth="2" />
                          <circle cx={activeItem.x} cy={activeItem.yBooked} r="5" fill="#4ade80" stroke="#ffffff" strokeWidth="2" />
                        </g>
                      )}

                      {/* Precise Transparent Column Hitboxes (100% Accurate Hover Trigger) */}
                      {pointsData.map((p, i) => {
                        const startX = i === 0 ? padding : p.x - colW / 2;
                        const width = i === 0 || i === pointsData.length - 1 ? colW / 2 + padding / 2 : colW;
                        return (
                          <rect
                            key={p.month.key}
                            x={startX}
                            y={0}
                            width={width}
                            height={svgHeight}
                            fill="transparent"
                            onMouseEnter={() => setHoveredIndex(i)}
                          />
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>

              {/* Monthly Performance Matrix Table */}
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th>Active Dealers</th>
                      <th>30d / 60d / 90d+ Inactive</th>
                      <th>Apps</th>
                      <th>Approvals</th>
                      <th>Booked</th>
                      <th>Booked $</th>
                      <th>L-B %</th>
                      <th>A-B %</th>
                      <th>2026 Budget Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Header Totals Summary Row */}
                    <tr className={styles.totalsRow}>
                      <td style={{ color: '#60a5fa', fontWeight: 800 }}>TOTAL / OVERALL ({timeframeMode === 'ytd' ? 'YTD 2026' : '2025–Present'})</td>
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
                      <td style={{ color: '#4ade80', fontWeight: 800 }}>{totals.booked.toLocaleString()}</td>
                      <td style={{ color: '#4ade80', fontWeight: 800 }}>{formatCurrency(totals.bookedDollars)}</td>
                      <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.lookToBook * 100).toFixed(1)}%</td>
                      <td style={{ color: '#f8fafc', fontWeight: 800 }}>{(totals.approvalToBook * 100).toFixed(1)}%</td>
                      <td style={{ color: totals.budgetTarget > 0 ? '#38bdf8' : '#64748b', fontWeight: 800 }}>
                        {totals.budgetTarget > 0 ? formatCurrency(totals.budgetTarget) : '—'}
                      </td>
                    </tr>

                    {/* Monthly Historical Rows (Most Recent First) */}
                    {[...months].reverse().map((m: HistoricalMoMItem) => (
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
                          {m.stats.apps} {renderBadge(m.trends.apps)}
                        </td>
                        <td>
                          {m.stats.approvals} {renderBadge(m.trends.approvals)}
                        </td>
                        <td>
                          {m.stats.booked} {renderBadge(m.trends.booked)}
                        </td>
                        <td style={{ fontWeight: 600 }}>
                          {formatCurrency(m.stats.bookedDollars)}{' '}
                          {renderBadge(m.trends.bookedDollars)}
                        </td>
                        <td>{(m.stats.lookToBook * 100).toFixed(1)}%</td>
                        <td>{(m.stats.approvalToBook * 100).toFixed(1)}%</td>
                        <td style={{ color: m.budgetTarget > 0 ? '#cbd5e1' : '#64748b' }}>
                          {m.budgetTarget > 0 ? formatCurrency(m.budgetTarget) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
