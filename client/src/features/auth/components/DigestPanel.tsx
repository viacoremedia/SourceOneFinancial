import { useState, useEffect, useCallback } from 'react';
import api from '../../../core/services/api';
import styles from './DigestPanel.module.css';

interface DigestData {
  reportDate: string;
  totalDealers: number;
  totalGroups: number;
  totalSnapshotsToday: number;
  status: {
    active: number;
    inactive30: number;
    inactive60: number;
    longInactive: number;
    neverActive: number;
  };
  statusChanges: {
    active: number;
    inactive30: number;
    inactive60: number;
    longInactive: number;
  };
  events: {
    newApplications: number;
    newApprovals: number;
    newBookings: number;
    reactivations: number;
  };
  atRiskDealers: {
    dealerName: string;
    dealerId: string;
    rep: string;
    daysSinceLastApplication: number;
  }[];
  statusTransitions: {
    dealerName: string;
    dealerId: string;
    rep: string;
    from: string;
    to: string;
  }[];
  hasYesterdayData: boolean;
}

interface DigestPanelProps {
  open: boolean;
  onClose: () => void;
  latestReportDate?: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: '#34d399' },
  '30d_inactive': { label: '30d Inactive', color: '#fbbf24' },
  '60d_inactive': { label: '60d Inactive', color: '#f97316' },
  long_inactive: { label: 'Long Inactive', color: '#ef4444' },
  never_active: { label: 'Never Active', color: '#64748b' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { label: status, color: '#94a3b8' };
  return <span className={styles.statusBadge} style={{ color: s.color }}>{s.label}</span>;
}

export function DigestPanel({ open, onClose }: DigestPanelProps) {
  const [data, setData] = useState<DigestData | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [repFilter, setRepFilter] = useState<string>('');
  const [flowFilter, setFlowFilter] = useState<string>('');

  // Fetch available dates
  useEffect(() => {
    if (open) {
      api.get('/reports/digest/dates')
        .then(({ data: res }) => {
          setDates(res.dates);
          if (res.dates.length > 0 && !selectedDate) {
            setSelectedDate(res.dates[0]);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  // Fetch digest data when date changes
  const fetchDigest = useCallback(async (date: string) => {
    if (!date) return;
    setLoading(true);
    try {
      const { data: res } = await api.get(`/reports/digest?date=${date}`);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDate && open) fetchDigest(selectedDate);
  }, [selectedDate, open, fetchDigest]);

  if (!open) return null;

  // Compute flow summary from transitions
  const flowGroups: Record<string, { from: string; to: string; count: number }> = {};
  const flows: Record<string, { in: number; out: number }> = {
    active: { in: 0, out: 0 },
    '30d_inactive': { in: 0, out: 0 },
    '60d_inactive': { in: 0, out: 0 },
    long_inactive: { in: 0, out: 0 },
  };

  if (data) {
    for (const t of data.statusTransitions) {
      const key = `${t.from}→${t.to}`;
      if (!flowGroups[key]) flowGroups[key] = { from: t.from, to: t.to, count: 0 };
      flowGroups[key].count++;
      if (flows[t.from]) flows[t.from].out++;
      if (flows[t.to]) flows[t.to].in++;
    }
  }

  const flowSummaryItems = Object.values(flowGroups).sort((a, b) => b.count - a.count);

  // Extract unique reps from transitions
  const allReps = data
    ? [...new Set(data.statusTransitions.map(t => t.rep))].filter(r => r !== '—').sort()
    : [];

  const filteredTransitions = data
    ? data.statusTransitions.filter(t => {
        if (repFilter && t.rep !== repFilter) return false;
        if (flowFilter && `${t.from}→${t.to}` !== flowFilter) return false;
        return true;
      })
    : [];

  const activeRate = data && data.totalSnapshotsToday > 0
    ? Math.round((data.status.active / data.totalSnapshotsToday) * 100)
    : 0;

  const formatDate = (d: string) => {
    const date = new Date(d + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        {/* Header */}
        <div className={styles.panelHeader}>
          <div>
            <h2>📊 Daily Digest</h2>
            {data && <div className={styles.dateSubtitle}>{formatDate(selectedDate)}</div>}
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Date picker */}
        <div className={styles.datePicker}>
          <select
            className={styles.dateSelect}
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          >
            {dates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <div className={styles.dateNav}>
            <button
              className={styles.navBtn}
              disabled={dates.indexOf(selectedDate) >= dates.length - 1}
              onClick={() => {
                const idx = dates.indexOf(selectedDate);
                if (idx < dates.length - 1) setSelectedDate(dates[idx + 1]);
              }}
            >← Older</button>
            <button
              className={styles.navBtn}
              disabled={dates.indexOf(selectedDate) <= 0}
              onClick={() => {
                const idx = dates.indexOf(selectedDate);
                if (idx > 0) setSelectedDate(dates[idx - 1]);
              }}
            >Newer →</button>
          </div>
        </div>

        {loading && <div className={styles.loadingMsg}>Loading digest...</div>}

        {!loading && data && (
          <div className={styles.digestContent}>
            {/* Status Cards */}
            <div className={styles.statusGrid}>
              <div className={styles.statusCard}>
                <div className={styles.statusValue} style={{ color: '#34d399' }}>
                  {data.status.active.toLocaleString()}
                </div>
                <div className={styles.statusLabel}>Active</div>
                {data.hasYesterdayData && (
                  <div className={styles.statusFlow}>
                    {flows.active.in > 0 && <span className={styles.flowIn}>↑{flows.active.in}</span>}
                    {flows.active.out > 0 && <span className={styles.flowOut}>↓{flows.active.out}</span>}
                    {flows.active.in === 0 && flows.active.out === 0 && <span className={styles.flowNone}>—</span>}
                  </div>
                )}
              </div>
              <div className={styles.statusCard}>
                <div className={styles.statusValue} style={{ color: '#fbbf24' }}>
                  {data.status.inactive30.toLocaleString()}
                </div>
                <div className={styles.statusLabel}>30d Inactive</div>
                {data.hasYesterdayData && (
                  <div className={styles.statusFlow}>
                    {flows['30d_inactive'].in > 0 && <span className={styles.flowIn}>↑{flows['30d_inactive'].in}</span>}
                    {flows['30d_inactive'].out > 0 && <span className={styles.flowOut}>↓{flows['30d_inactive'].out}</span>}
                    {flows['30d_inactive'].in === 0 && flows['30d_inactive'].out === 0 && <span className={styles.flowNone}>—</span>}
                  </div>
                )}
              </div>
              <div className={styles.statusCard}>
                <div className={styles.statusValue} style={{ color: '#f97316' }}>
                  {data.status.inactive60.toLocaleString()}
                </div>
                <div className={styles.statusLabel}>60d Inactive</div>
                {data.hasYesterdayData && (
                  <div className={styles.statusFlow}>
                    {flows['60d_inactive'].in > 0 && <span className={styles.flowIn}>↑{flows['60d_inactive'].in}</span>}
                    {flows['60d_inactive'].out > 0 && <span className={styles.flowOut}>↓{flows['60d_inactive'].out}</span>}
                    {flows['60d_inactive'].in === 0 && flows['60d_inactive'].out === 0 && <span className={styles.flowNone}>—</span>}
                  </div>
                )}
              </div>
              <div className={styles.statusCard}>
                <div className={styles.statusValue} style={{ color: '#ef4444' }}>
                  {data.status.longInactive.toLocaleString()}
                </div>
                <div className={styles.statusLabel}>Long Inactive</div>
                {data.hasYesterdayData && (
                  <div className={styles.statusFlow}>
                    {flows.long_inactive.in > 0 && <span className={styles.flowIn}>↑{flows.long_inactive.in}</span>}
                    {flows.long_inactive.out > 0 && <span className={styles.flowOut}>↓{flows.long_inactive.out}</span>}
                    {flows.long_inactive.in === 0 && flows.long_inactive.out === 0 && <span className={styles.flowNone}>—</span>}
                  </div>
                )}
              </div>
            </div>

            {/* Active Rate */}
            <div className={styles.rateCard}>
              <div className={styles.rateHeader}>
                <span className={styles.rateLabel}>Network Active Rate</span>
                <span className={styles.rateValue} style={{
                  color: activeRate >= 50 ? '#34d399' : activeRate >= 30 ? '#fbbf24' : '#ef4444'
                }}>{activeRate}%</span>
              </div>
              <div className={styles.rateBar}>
                <div className={styles.rateFill} style={{ width: `${activeRate}%` }} />
              </div>
              <div className={styles.rateSubtext}>
                {data.totalSnapshotsToday.toLocaleString()} dealers across {data.totalGroups} groups
              </div>
            </div>



            {/* Flow Summary */}
            {flowSummaryItems.length > 0 && (
              <div className={styles.flowSummary}>
                <h3 className={styles.sectionTitle}>Status Flow Summary</h3>
                <div className={styles.flowPills}>
                  {flowSummaryItems.map(f => {
                    const key = `${f.from}→${f.to}`;
                    const isActive = flowFilter === key;
                    return (
                      <button
                        key={key}
                        className={`${styles.flowPill} ${isActive ? styles.flowPillActive : ''}`}
                        onClick={() => setFlowFilter(isActive ? '' : key)}
                      >
                        <StatusBadge status={f.from} />
                        <span className={styles.flowArrow}>→</span>
                        <StatusBadge status={f.to} />
                        <span className={styles.flowCount}>{f.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Status Changes Table */}
            {data.statusTransitions.length > 0 && (
              <div className={styles.tableSection}>
                <div className={styles.tableSectionHeader}>
                  <h3 className={styles.sectionTitle}>
                    🔄 Status Changes ({filteredTransitions.length}{(repFilter || flowFilter) ? ` of ${data.statusTransitions.length}` : ''})
                  </h3>
                  {allReps.length > 1 && (
                    <select
                      className={styles.repFilter}
                      value={repFilter}
                      onChange={e => setRepFilter(e.target.value)}
                    >
                      <option value="">All Reps</option>
                      {allReps.map(r => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Dealer</th>
                        <th>ID</th>
                        <th>Rep</th>
                        <th style={{ textAlign: 'center' }}>From</th>
                        <th style={{ textAlign: 'center' }}></th>
                        <th style={{ textAlign: 'center' }}>To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTransitions.map((t, i) => (
                        <tr key={i}>
                          <td className={styles.dealerName}>{t.dealerName || 'Unknown'}</td>
                          <td className={styles.dealerIdCell}>{t.dealerId}</td>
                          <td className={styles.repCell}>{t.rep}</td>
                          <td style={{ textAlign: 'center' }}><StatusBadge status={t.from} /></td>
                          <td className={styles.arrowCell}>→</td>
                          <td style={{ textAlign: 'center' }}><StatusBadge status={t.to} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* At-Risk Dealers */}
            {data.atRiskDealers.length > 0 && (
              <div className={styles.tableSection}>
                <h3 className={styles.sectionTitle}>⚠️ At-Risk Dealers</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Dealer</th>
                        <th>ID</th>
                        <th>Rep</th>
                        <th style={{ textAlign: 'right' }}>Days Since App</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atRiskDealers.map((d, i) => (
                        <tr key={i}>
                          <td className={styles.dealerName}>{d.dealerName || 'Unknown'}</td>
                          <td className={styles.dealerIdCell}>{d.dealerId}</td>
                          <td className={styles.repCell}>{d.rep}</td>
                          <td className={styles.daysCell}>{d.daysSinceLastApplication}d</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !data && <div className={styles.loadingMsg}>No data available for this date.</div>}
      </div>
    </>
  );
}
