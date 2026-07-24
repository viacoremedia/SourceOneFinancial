import { useState, useEffect } from 'react';
import styles from './DealerDrawer.module.css';
import { getDealerApplicationsHistory } from '../../../../core/services/api';
import type {
  DealerApplicationHistoryResponse,
  ApplicationHistoryItem
} from '../../types';

interface DealerDrawerProps {
  dealerId: string | null;
  onClose: () => void;
}

export function DealerDrawer({ dealerId, onClose }: DealerDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DealerApplicationHistoryResponse | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!dealerId) {
      setData(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    getDealerApplicationsHistory(dealerId, page, 15)
      .then((res) => {
        if (isMounted) {
          setData(res);
        }
      })
      .catch((err) => {
        console.error('Failed to load dealer application history:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [dealerId, page]);

  if (!dealerId) return null;

  const summary = data?.summary;
  const location = data?.location;
  const applications = data?.applications || [];
  const pagination = data?.pagination;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className="mobileDragHandleRow">
          <div className="mobileDragHandle" />
        </div>
        {/* Drawer Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.dealerTitle}>{location?.dealerName || 'Dealer Application History'}</h2>
            <div className={styles.metaRow}>
              {location?.dealerId && <span className={styles.badge}>ID: {location.dealerId}</span>}
              {location?.statePrefix && <span className={styles.badge}>{location.statePrefix}</span>}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close drawer">
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div className={styles.body}>
          {/* Summary Cards */}
          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <span className={styles.cardScope}>All-Time</span>
              <div className={styles.cardMain}>
                <span className={styles.cardValue}>{summary?.allTime.apps.toLocaleString() || '0'}</span>
                <span className={styles.cardSub}>Apps</span>
              </div>
              <div className={styles.cardDetails}>
                <span>Appr: {summary?.allTime.approvals.toLocaleString() || '0'}</span>
                <span>Bkd: {summary?.allTime.booked.toLocaleString() || '0'}</span>
                <span>Dollars: ${(summary?.allTime.bookedDollars || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.cardScope}>YTD</span>
              <div className={styles.cardMain}>
                <span className={styles.cardValue}>{summary?.ytd.apps.toLocaleString() || '0'}</span>
                <span className={styles.cardSub}>Apps</span>
              </div>
              <div className={styles.cardDetails}>
                <span>Appr: {summary?.ytd.approvals.toLocaleString() || '0'}</span>
                <span>Bkd: {summary?.ytd.booked.toLocaleString() || '0'}</span>
                <span>Dollars: ${(summary?.ytd.bookedDollars || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.cardScope}>MTD</span>
              <div className={styles.cardMain}>
                <span className={styles.cardValue}>{summary?.mtd.apps.toLocaleString() || '0'}</span>
                <span className={styles.cardSub}>Apps</span>
              </div>
              <div className={styles.cardDetails}>
                <span>Appr: {summary?.mtd.approvals.toLocaleString() || '0'}</span>
                <span>Bkd: {summary?.mtd.booked.toLocaleString() || '0'}</span>
                <span>Dollars: ${(summary?.mtd.bookedDollars || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Applications Table */}
          <div className={styles.tableSection}>
            <div className={styles.tableHeaderBar}>
              <h3 className={styles.sectionTitle}>Application Records ({pagination?.totalCount || 0})</h3>
            </div>

            {loading && page === 1 ? (
              <div className={styles.loadingState}>Loading application records...</div>
            ) : applications.length === 0 ? (
              <div className={styles.emptyState}>No application records found for this location.</div>
            ) : (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Application ID</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Days Ago</th>
                      <th>Financed Amount</th>
                      <th>Lender</th>
                      <th>FICO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {applications.map((app: ApplicationHistoryItem) => (
                      <tr key={app._id}>
                        <td className={styles.appIdCell}>{app.applicationId}</td>
                        <td>
                          <span
                            className={`${styles.statusTag} ${
                              app.status === 'Booked'
                                ? styles.statusBooked
                                : app.status === 'Approved' || app.status === 'Auto Approval' || app.status === 'Conditional Approval'
                                ? styles.statusApproved
                                : styles.statusDefault
                            }`}
                          >
                            {app.status || 'Pending'}
                          </span>
                        </td>
                        <td>{app.applicationDate ? new Date(app.applicationDate).toLocaleDateString() : '—'}</td>
                        <td className={styles.daysAgoCell}>
                          {app.daysAgo != null ? `${app.daysAgo}d ago` : '—'}
                        </td>
                        <td className={styles.amountCell}>
                          {app.amountFinanced != null ? `$${app.amountFinanced.toLocaleString()}` : '—'}
                        </td>
                        <td>{app.lender || '—'}</td>
                        <td className={styles.ficoCell}>{app.primaryFicoAuto8 || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className={styles.paginationRow}>
                <button
                  className={styles.pageBtn}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Previous
                </button>
                <span className={styles.pageInfo}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  className={styles.pageBtn}
                  disabled={!pagination.hasMore || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
