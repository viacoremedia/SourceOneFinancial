/**
 * UnderwriterScorecard — Operational drawer displaying underwriter performance metrics:
 * speed to decision, approval win rates, decline rates, conditional approvals,
 * dual model App Bkd vs Funded Bkd metrics, lender distribution breakdown bars,
 * totals summary row, and clickable underwriter names to view app history.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import styles from './UnderwriterScorecard.module.css';
import type { UnderwriterStats } from '../../types';
import { getUnderwriterScorecardApi } from '../../../../core/services/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectUnderwriter?: (underwriterName: string) => void;
}

type DatePreset = 'mtd' | '30d' | '90d' | 'ytd' | 'all';

interface ColumnDef {
  key: string;
  label: string;
  short: string;
  align: 'left' | 'right' | 'center';
  getValue: (u: UnderwriterStats) => number | string | null;
  format: (val: any) => string;
}

const LENDER_COLORS = [
  '#38bdf8', // Sky blue (Source One)
  '#a855f7', // Purple
  '#34d399', // Emerald
  '#fbbf24', // Amber
  '#f87171', // Red
  '#818cf8', // Indigo
  '#f472b6', // Pink
  '#2dd4bf', // Teal
];

function renderLenderBar(breakdown?: Array<{ lender: string; count: number; pct: number }>) {
  if (!breakdown || !breakdown.length) return '—';

  return (
    <div
      className={styles.lenderBarTrack}
      title={breakdown.map((b) => `${b.lender}: ${b.count} (${(b.pct * 100).toFixed(1)}%)`).join('\n')}
    >
      {breakdown.map((b, idx) => {
        const color = LENDER_COLORS[idx % LENDER_COLORS.length];
        const widthPct = Math.max(1, b.pct * 100);
        return (
          <div
            key={b.lender}
            className={styles.lenderSegment}
            style={{ width: `${widthPct}%`, background: color }}
            title={`${b.lender}: ${b.count} deals (${(b.pct * 100).toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

function formatDollar(v: any): string {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'underwriter', label: 'Underwriter', short: 'Underwriter', align: 'left',
    getValue: (u) => u.underwriter,
    format: (v) => String(v || '—'),
  },
  {
    key: 'totalApps', label: 'Total Apps', short: 'Apps', align: 'right',
    getValue: (u) => u.totalApps,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'approvedCount', label: 'Approved #', short: 'Appr #', align: 'right',
    getValue: (u) => u.approvedCount,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'conditionalCount', label: 'Conditional #', short: 'Cond #', align: 'right',
    getValue: (u) => u.conditionalCount,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'declinedCount', label: 'Declined #', short: 'Decl #', align: 'right',
    getValue: (u) => u.declinedCount,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'leadBookedCount', label: 'App Booked Deals', short: 'App Bkd #', align: 'right',
    getValue: (u) => u.leadBookedCount ?? u.bookedCount ?? 0,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'leadBookedVolume', label: 'App Booked Volume', short: 'App Vol $', align: 'right',
    getValue: (u) => u.leadBookedVolume ?? u.bookedVolume ?? 0,
    format: (v) => formatDollar(v),
  },
  {
    key: 'closeBookedCount', label: 'Funded Deals', short: 'Funded Bkd #', align: 'right',
    getValue: (u) => u.closeBookedCount ?? u.bookedCount ?? 0,
    format: (v) => Number(v || 0).toLocaleString(),
  },
  {
    key: 'closeBookedVolume', label: 'Funded Volume', short: 'Funded Vol $', align: 'right',
    getValue: (u) => u.closeBookedVolume ?? u.bookedVolume ?? 0,
    format: (v) => formatDollar(v),
  },
  {
    key: 'approvalRate', label: 'Approval Rate', short: 'Appr %', align: 'right',
    getValue: (u) => u.approvalRate,
    format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}%` : '—',
  },
  {
    key: 'winRate', label: 'Win Rate (A2B)', short: 'Win Rate', align: 'right',
    getValue: (u) => u.winRate,
    format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}%` : '—',
  },
  {
    key: 'declineRate', label: 'Decline Rate', short: 'Decl %', align: 'right',
    getValue: (u) => u.declineRate,
    format: (v) => v != null ? `${(Number(v) * 100).toFixed(1)}%` : '—',
  },
  {
    key: 'avgTurnTimeHours', label: 'Turn Time (hrs)', short: 'Turn Time', align: 'right',
    getValue: (u) => u.avgTurnTimeHours,
    format: (v) => v != null ? `${v}h` : '—',
  },
  {
    key: 'avgFico', label: 'AVG FICO', short: 'AVG FICO', align: 'right',
    getValue: (u) => u.avgFico,
    format: (v) => v != null ? String(v) : '—',
  },
  {
    key: 'uniqueLenderCount', label: 'Unique Lenders', short: 'Lenders', align: 'right',
    getValue: (u) => u.uniqueLenderCount ?? 0,
    format: (v) => String(v || 0),
  },
  {
    key: 'lenderShare', label: 'Lender Distribution', short: 'Lender Distribution', align: 'center',
    getValue: (u) => u.sourceOnePct,
    format: (v) => String(v || ''),
  },
];

export function UnderwriterScorecard({ isOpen, onClose, onSelectUnderwriter }: Props) {
  const [data, setData] = useState<UnderwriterStats[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('mtd');

  const [sortKey, setSortKey] = useState<string>('totalApps');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Compute date range parameters based on preset
  const dateParams = useMemo(() => {
    const now = new Date('2026-07-28T23:59:59.999Z');
    if (datePreset === 'all') return { startDate: undefined, endDate: undefined };

    let start: Date;
    if (datePreset === 'mtd') {
      start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    } else if (datePreset === '30d') {
      start = new Date(now.getTime() - 30 * 86400 * 1000);
    } else if (datePreset === '90d') {
      start = new Date(now.getTime() - 90 * 86400 * 1000);
    } else {
      start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    };
  }, [datePreset]);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    getUnderwriterScorecardApi(dateParams.startDate, dateParams.endDate)
      .then((resData) => {
        if (resData.success) {
          setData(resData.underwriters || []);
        } else {
          setError(resData.message || 'Failed to load underwriter metrics');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, dateParams]);

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'underwriter' ? 'asc' : 'desc');
    }
  }, [sortKey]);

  const sortedData = useMemo(() => {
    if (!data.length) return [];
    const col = COLUMNS.find((c) => c.key === sortKey);
    return [...data].sort((a, b) => {
      const aVal = col ? col.getValue(a) : a.underwriter;
      const bVal = col ? col.getValue(b) : b.underwriter;
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const diff = (aVal as number) - (bVal as number);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [data, sortKey, sortDir]);

  // Compute Totals summary row
  const totals = useMemo(() => {
    if (!data.length) return null;
    let totalApps = 0;
    let approvedCount = 0;
    let conditionalCount = 0;
    let declinedCount = 0;
    let leadBookedCount = 0;
    let leadBookedVolume = 0;
    let closeBookedCount = 0;
    let closeBookedVolume = 0;
    let turnTimeSum = 0;
    let turnTimeCount = 0;
    let ficoSum = 0;
    let ficoCount = 0;
    const overallLenderCounts: Record<string, number> = {};

    for (const u of data) {
      totalApps += u.totalApps || 0;
      approvedCount += u.approvedCount || 0;
      conditionalCount += u.conditionalCount || 0;
      declinedCount += u.declinedCount || 0;
      leadBookedCount += u.leadBookedCount ?? u.bookedCount ?? 0;
      leadBookedVolume += u.leadBookedVolume ?? u.bookedVolume ?? 0;
      closeBookedCount += u.closeBookedCount ?? u.bookedCount ?? 0;
      closeBookedVolume += u.closeBookedVolume ?? u.bookedVolume ?? 0;
      if (u.avgTurnTimeHours != null) {
        turnTimeSum += u.avgTurnTimeHours * u.totalApps;
        turnTimeCount += u.totalApps;
      }
      if (u.avgFico != null) {
        ficoSum += u.avgFico * u.totalApps;
        ficoCount += u.totalApps;
      }
      for (const b of u.lenderBreakdown || []) {
        overallLenderCounts[b.lender] = (overallLenderCounts[b.lender] || 0) + b.count;
      }
    }

    const approvalRate = totalApps > 0 ? Number((approvedCount / totalApps).toFixed(4)) : 0;
    const winRate = approvedCount > 0 ? Number((leadBookedCount / approvedCount).toFixed(4)) : 0;
    const declineRate = totalApps > 0 ? Number((declinedCount / totalApps).toFixed(4)) : 0;
    const avgTurnTimeHours = turnTimeCount > 0 ? Number((turnTimeSum / turnTimeCount).toFixed(1)) : null;
    const avgFico = ficoCount > 0 ? Math.round(ficoSum / ficoCount) : null;

    const lenderBreakdown = Object.entries(overallLenderCounts)
      .map(([lender, count]) => ({
        lender,
        count,
        pct: totalApps > 0 ? Number((count / totalApps).toFixed(4)) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      underwriter: 'TOTALS',
      totalApps,
      approvedCount,
      conditionalCount,
      declinedCount,
      leadBookedCount,
      leadBookedVolume,
      closeBookedCount,
      closeBookedVolume,
      bookedCount: closeBookedCount,
      bookedVolume: closeBookedVolume,
      approvalRate,
      winRate,
      declineRate,
      avgTurnTimeHours,
      avgFico,
      uniqueLenderCount: lenderBreakdown.length,
      lenderBreakdown,
    };
  }, [data]);

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>
              <span>⚡ Underwriter & Lender Performance Scorecard</span>
            </h2>
          </div>

          <div className={styles.controlsGroup}>
            <div className={styles.dateToggle}>
              {[
                { key: 'mtd', label: 'MTD' },
                { key: '30d', label: '30d' },
                { key: '90d', label: '90d' },
                { key: 'ytd', label: 'YTD' },
                { key: 'all', label: 'All-Time' },
              ].map((p) => (
                <button
                  key={p.key}
                  className={`${styles.dateBtn} ${datePreset === p.key ? styles.dateBtnActive : ''}`}
                  onClick={() => setDatePreset(p.key as DatePreset)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.content}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
              Loading underwriter performance metrics...
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
              {error}
            </div>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        style={{ textAlign: col.align }}
                        onClick={() => handleSort(col.key)}
                        title={`Click to sort by ${col.label}`}
                      >
                        {col.short}
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((u) => (
                    <tr key={u.underwriter}>
                      <td style={{ fontWeight: 600 }}>
                        <span
                          className={styles.underwriterLink}
                          onClick={() => onSelectUnderwriter?.(u.underwriter)}
                          title={`Click to view ${u.underwriter}'s application history`}
                        >
                          {u.underwriter}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{COLUMNS[1].format(u.totalApps)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[2].format(u.approvedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#fbbf24' }}>{COLUMNS[3].format(u.conditionalCount)}</td>
                      <td style={{ textAlign: 'right', color: '#f87171' }}>{COLUMNS[4].format(u.declinedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[5].format(u.leadBookedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[6].format(u.leadBookedVolume)}</td>
                      <td style={{ textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{COLUMNS[7].format(u.closeBookedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#4ade80', fontWeight: 700 }}>{COLUMNS[8].format(u.closeBookedVolume)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[9].format(u.approvalRate)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#34d399' }}>{COLUMNS[10].format(u.winRate)}</td>
                      <td style={{ textAlign: 'right', color: '#f87171' }}>{COLUMNS[11].format(u.declineRate)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[12].format(u.avgTurnTimeHours)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{COLUMNS[13].format(u.avgFico)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`${styles.badge} ${styles.badgePurple}`} title={(u.uniqueLenders || []).join(', ')}>
                          {COLUMNS[14].format(u.uniqueLenderCount)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {renderLenderBar(u.lenderBreakdown)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totals && (
                  <tfoot className={styles.tfoot}>
                    <tr>
                      <td style={{ color: '#38bdf8', fontWeight: 800 }}>TOTALS</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[1].format(totals.totalApps)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[2].format(totals.approvedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#fbbf24' }}>{COLUMNS[3].format(totals.conditionalCount)}</td>
                      <td style={{ textAlign: 'right', color: '#f87171' }}>{COLUMNS[4].format(totals.declinedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[5].format(totals.leadBookedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#38bdf8' }}>{COLUMNS[6].format(totals.leadBookedVolume)}</td>
                      <td style={{ textAlign: 'right', color: '#4ade80' }}>{COLUMNS[7].format(totals.closeBookedCount)}</td>
                      <td style={{ textAlign: 'right', color: '#4ade80' }}>{COLUMNS[8].format(totals.closeBookedVolume)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[9].format(totals.approvalRate)}</td>
                      <td style={{ textAlign: 'right', color: '#34d399' }}>{COLUMNS[10].format(totals.winRate)}</td>
                      <td style={{ textAlign: 'right', color: '#f87171' }}>{COLUMNS[11].format(totals.declineRate)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[12].format(totals.avgTurnTimeHours)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[13].format(totals.avgFico)}</td>
                      <td style={{ textAlign: 'right' }}>{COLUMNS[14].format(totals.uniqueLenderCount)}</td>
                      <td style={{ textAlign: 'center' }}>{renderLenderBar(totals.lenderBreakdown)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
