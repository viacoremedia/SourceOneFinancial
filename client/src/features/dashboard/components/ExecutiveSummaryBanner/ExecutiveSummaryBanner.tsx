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

function renderTrendTag(trendObj?: MetricTrend, isPct = false) {
  if (!trendObj) return null;
  const { pct, diff } = trendObj;
  const isUp = pct > 0;
  const isDown = pct < 0;
  const sign = isUp ? '+' : '';
  const formattedDiff = isPct
    ? `${(diff * 100).toFixed(1)}%`
    : typeof diff === 'number' && Math.abs(diff) >= 1000
    ? formatCurrency(diff)
    : diff;

  const trendClass = isUp ? styles.trendUp : isDown ? styles.trendDown : styles.trendFlat;
  const arrow = isUp ? '↑' : isDown ? '↓' : '→';

  return (
    <span className={`${styles.trendTag} ${trendClass}`}>
      {arrow} {sign}{pct}% ({formattedDiff})
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
  status
}: ExecutiveSummaryBannerProps) {
  const [data, setData] = useState<ExecutiveSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getExecutiveSummary(startDate, endDate, trend, state, rep, groupSlug, status)
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
  }, [startDate, endDate, trend, state, rep, groupSlug, status]);

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
      <div className={styles.topRow}>
        <div className={styles.dateRangeTitle}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc' }}>
            NETWORK PERFORMANCE
          </span>
          <span className={styles.dateBadge}>{dateRange?.label}</span>
        </div>
        {comparisonLabel && <span className={styles.comparisonLabel}>{comparisonLabel}</span>}
      </div>

      {/* 6 Network KPI Cards */}
      <div className={styles.kpiGrid}>
        {/* Apps */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Apps</span>
            {renderTrendTag(trends?.apps)}
          </div>
          <div className={styles.kpiValue}>{totals?.apps?.toLocaleString() || 0}</div>
        </div>

        {/* Approvals */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Approvals</span>
            {renderTrendTag(trends?.approvals)}
          </div>
          <div className={styles.kpiValue}>{totals?.approvals?.toLocaleString() || 0}</div>
        </div>

        {/* Booked */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Booked</span>
            {renderTrendTag(trends?.booked)}
          </div>
          <div className={styles.kpiValue}>{totals?.booked?.toLocaleString() || 0}</div>
        </div>

        {/* Booked $ */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Booked Volume</span>
            {renderTrendTag(trends?.bookedDollars)}
          </div>
          <div className={styles.kpiValue}>{formatCurrency(totals?.bookedDollars || 0)}</div>
        </div>

        {/* Look-to-Book */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Look-to-Book</span>
            {renderTrendTag(trends?.lookToBook, true)}
          </div>
          <div className={styles.kpiValue}>{formatPercent(totals?.lookToBook || 0)}</div>
        </div>

        {/* Approval-to-Book */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <span className={styles.kpiLabel}>Approval-to-Book</span>
            {renderTrendTag(trends?.approvalToBook, true)}
          </div>
          <div className={styles.kpiValue}>{formatPercent(totals?.approvalToBook || 0)}</div>
        </div>
      </div>

      {/* Executive Row: Budget Variance & Pacing Run-Rates (hidden for now) */}
      {/* 
      <div className={styles.executiveGrid}>
        <div className={styles.execCard}>
          <div className={styles.execTitle}>Budget Target & Variance</div>
          <div className={styles.execValue}>
            {formatCurrency(budget?.actualBookedDollars || 0)}{' '}
            <span style={{ fontSize: '0.85rem', fontWeight: 500, color: '#94a3b8' }}>
              / {formatCurrency(budget?.targetBookedDollars || 0)} Goal
            </span>
          </div>
          <div className={styles.execSub}>
            Variance:{' '}
            <strong className={budget?.isOverBudget ? styles.overBudget : styles.underBudget}>
              {budget?.isOverBudget ? '+' : ''}
              {formatCurrency(budget?.varianceDollars || 0)} ({budget?.percentAchieved}%)
            </strong>
          </div>
        </div>

        <div className={styles.execCard}>
          <div className={styles.execTitle}>Current Month Run-Rate Pace</div>
          <div className={styles.execValue}>{formatCurrency(pacing?.mtdPace || 0)}</div>
          <div className={styles.execSub}>
            Actual: {formatCurrency(pacing?.mtdActualBookedDollars || 0)} ({pacing?.daysElapsedCurrentMonth}/{pacing?.daysInCurrentMonth} days)
          </div>
        </div>

        <div className={styles.execCard}>
          <div className={styles.execTitle}>Full Year 2026 Pacing (Seasonally Weighted)</div>
          <div className={styles.execValue}>{formatCurrency(pacing?.fullYearPace || 0)}</div>
          <div className={styles.execSub}>
            2026 Target: {formatCurrency(pacing?.annualBudget || 0)} | YTD Actual: {formatCurrency(pacing?.ytdActualBookedDollars || 0)}
          </div>
        </div>
      </div>
      */}
    </div>
  );
}
