import { useEffect, useState } from 'react';
import { getExecutiveSummary } from '../../../../core/services/api';
import type { ExecutiveSummaryResponse, MetricTrend } from '../../types';
import styles from './ExecutiveSummaryBanner.module.css';

interface ExecutiveSummaryBannerProps {
  startDate?: string;
  endDate?: string;
  trend?: string;
  state?: string;
  rep?: string;
  groupSlug?: string;
  status?: string | null;
  drd?: string | null;
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

function formatPercent(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

function renderTrendTag(trendObj?: MetricTrend, type: 'count' | 'dollar' | 'percent' = 'count') {
  if (!trendObj) return null;
  const { pct, baseline } = trendObj;
  if (pct === 0 && (!baseline || baseline === 0)) return null;

  const isUp = pct > 0;
  const isDown = pct < 0;
  const sign = isUp ? '+' : '';

  let formattedBaseline = '—';
  if (typeof baseline === 'number' && baseline > 0) {
    if (type === 'dollar') {
      formattedBaseline = formatCurrency(baseline);
    } else if (type === 'percent') {
      formattedBaseline = `${(baseline * 100).toFixed(1)}%`;
    } else {
      formattedBaseline = baseline >= 1000 ? `${(baseline / 1000).toFixed(1)}k` : baseline.toLocaleString();
    }
  }

  const trendClass = isUp ? styles.trendUp : isDown ? styles.trendDown : styles.trendFlat;
  const arrow = isUp ? '↑' : isDown ? '↓' : '→';

  return (
    <span className={`${styles.trendTag} ${trendClass}`}>
      {arrow} {sign}{pct}% ({formattedBaseline})
    </span>
  );
}

export function ExecutiveSummaryBanner({
  startDate,
  endDate,
  trend,
  state,
  rep,
  groupSlug,
  status,
  drd
}: ExecutiveSummaryBannerProps) {
  const [data, setData] = useState<ExecutiveSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getExecutiveSummary(startDate, endDate, trend, state, rep, groupSlug, status, drd)
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load executive summary:', err);
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startDate, endDate, trend, state, rep, groupSlug, status, drd]);

  if (isLoading && !data) {
    return (
      <div className={styles.bannerContainer}>
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
          Loading Executive Performance Banner...
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { dateRange, comparisonLabel, totals, trends } = data;

  return (
    <div className={styles.bannerContainer}>
      {/* Top Title & Context Bar */}
      <div className={styles.topRow}>
        <div className={styles.titleGroup}>
          <span className={styles.liveText}>NETWORK PERFORMANCE</span>
          <span className={styles.dateBadge}>{dateRange?.label}</span>
        </div>
        {comparisonLabel && <div className={styles.comparisonLabel}>{comparisonLabel}</div>}
      </div>

      {/* 6 Network KPI Cards */}
      <div className={styles.kpiGrid}>
        {/* Apps */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>APPS</span>
            {renderTrendTag(trends?.apps, 'count')}
          </div>
          <div className={styles.kpiValue}>{totals?.apps?.toLocaleString() || 0}</div>
        </div>

        {/* Approvals */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>APPROVALS</span>
            {renderTrendTag(trends?.approvals, 'count')}
          </div>
          <div className={styles.kpiValue}>{totals?.approvals?.toLocaleString() || 0}</div>
        </div>

        {/* Funded Booked Volume (Close Date) */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>FUNDED BKD VOLUME</span>
            {renderTrendTag(trends?.bookedDollars, 'dollar')}
          </div>
          <div className={styles.kpiValue}>{formatCurrency(totals?.closeBookedDollars || totals?.bookedDollars || 0)}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {totals?.closeBooked || totals?.booked || 0} funded deals in period
          </div>
        </div>

        {/* App Booked Volume (Application Date) */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>APP BKD VOLUME</span>
            {renderTrendTag(trends?.leadBookedDollars || trends?.bookedDollars, 'dollar')}
          </div>
          <div className={styles.kpiValue}>{formatCurrency(totals?.leadBookedDollars || 0)}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {totals?.leadBooked || 0} apps booked in period
          </div>
        </div>

        {/* Look-to-Book */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>LOOK-TO-BOOK</span>
            {renderTrendTag(trends?.lookToBook, 'percent')}
          </div>
          <div className={styles.kpiValue}>{formatPercent(totals?.lookToBook || 0)}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Booked / Total apps
          </div>
        </div>

        {/* Approval-to-Book */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>APPROVAL-TO-BOOK</span>
            {renderTrendTag(trends?.approvalToBook, 'percent')}
          </div>
          <div className={styles.kpiValue}>{formatPercent(totals?.approvalToBook || 0)}</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Booked / Approved apps
          </div>
        </div>

        {/* Avg FICO */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>AVG FICO</span>
          </div>
          <div className={styles.kpiValue} style={{ color: '#38bdf8' }}>
            {totals?.avgFico ? totals.avgFico : '—'}
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Credit score avg
          </div>
        </div>
      </div>
    </div>
  );
}
