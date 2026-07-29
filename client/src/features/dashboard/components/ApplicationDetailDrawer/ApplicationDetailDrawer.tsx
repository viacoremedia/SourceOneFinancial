import { useEffect } from 'react';
import type { ApplicationHistoryItem } from '../../types';
import styles from './ApplicationDetailDrawer.module.css';

interface ApplicationDetailDrawerProps {
  app: ApplicationHistoryItem | null;
  onClose: () => void;
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return `$${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${(val * (val <= 1 ? 100 : 1)).toFixed(1)}%`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
}

function formatDays(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${val} ${val === 1 ? 'day' : 'days'}`;
}

export function ApplicationDetailDrawer({ app, onClose }: ApplicationDetailDrawerProps) {
  // Prevent background body scroll when detail drawer is open
  useEffect(() => {
    if (!app) return;
    const orig = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = orig;
    };
  }, [app]);

  if (!app) return null;

  const isBooked = app.status === 'Booked';
  const isApproved =
    app.status === 'Approved' ||
    app.status === 'Auto Approval' ||
    app.status === 'Conditional Approval';

  const statusClass = isBooked
    ? styles.statusBooked
    : isApproved
    ? styles.statusApproved
    : styles.statusDefault;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <h2 className={styles.appIdTitle}>{app.applicationId}</h2>
            <span className={`${styles.statusBadge} ${statusClass}`}>
              {app.status || 'Pending'}
            </span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close detail view">
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className={styles.content}>
          {/* Highlight Cards */}
          <div className={styles.highlightGrid}>
            <div className={styles.highlightCard}>
              <span className={styles.highlightLabel}>Amount Financed</span>
              <span className={`${styles.highlightValue} ${styles.highlightValueMoney}`}>
                {formatCurrency(app.amountFinanced)}
              </span>
            </div>
            <div className={styles.highlightCard}>
              <span className={styles.highlightLabel}>Primary FICO</span>
              <span className={`${styles.highlightValue} ${styles.highlightValueFico}`}>
                {app.primaryFicoAuto8 != null ? app.primaryFicoAuto8 : '—'}
              </span>
            </div>
            <div className={styles.highlightCard}>
              <span className={styles.highlightLabel}>Lender</span>
              <span className={styles.highlightValue} style={{ fontSize: '0.95rem' }}>
                {app.lender || '—'}
              </span>
            </div>
            <div className={styles.highlightCard}>
              <span className={styles.highlightLabel}>App Date</span>
              <span className={styles.highlightValue} style={{ fontSize: '0.88rem' }}>
                {formatDate(app.applicationDate)}
              </span>
            </div>
          </div>

          {/* 🏢 Dealer & Sales Rep Information */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>🏢</span>
              <h3 className={styles.sectionTitle}>Dealer & Sales Rep Information</h3>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dealer Name</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueHighlight}`}>
                  {app.dealerName || '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Client Dealer ID</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {app.clientDealerId || '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dealer Group</span>
                <span className={styles.fieldValue}>{app.dealerGroup || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Location</span>
                <span className={styles.fieldValue}>
                  {app.dealerCity ? `${app.dealerCity}, ${app.dealerState || ''}` : app.dealerState || '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Sales Representative</span>
                <span className={styles.fieldValue}>{app.dealerRepresentative || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Submitted By</span>
                <span className={styles.fieldValue}>{app.applicationSubmittedUser || '—'}</span>
              </div>
            </div>
          </div>

          {/* 💵 Financial Terms & Rates */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>💵</span>
              <h3 className={styles.sectionTitle}>Financial Terms & Structure</h3>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Amount Financed</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.amountFinanced)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Term</span>
                <span className={styles.fieldValue}>
                  {app.term != null ? `${app.term} mos` : '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>APR %</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.apr)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Cash Down</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.cashDown)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Total Down</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.totalDown)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>LTV %</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.ltv)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Invoice</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.invoice)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Backend</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.backend)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dealer Reserve ($)</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatCurrency(app.dealerReserveAmount)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dealer Reserve (%)</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.dealerReservePercent)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Dealer Min Rate</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.dealerMinimumRate)}
                </span>
              </div>
            </div>
          </div>

          {/* 💳 Credit & Underwriting */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>💳</span>
              <h3 className={styles.sectionTitle}>Credit & Risk Profile</h3>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Primary FICO Auto 8</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {app.primaryFicoAuto8 != null ? app.primaryFicoAuto8 : '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Co-FICO Auto 8</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {app.coficoAuto8 != null ? app.coficoAuto8 : '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>DTI %</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.dti)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>PTI %</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {formatPercent(app.pti)}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Lender</span>
                <span className={styles.fieldValue}>{app.lender || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Underwriter</span>
                <span className={styles.fieldValue}>{app.underwriter || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Program Manual</span>
                <span className={styles.fieldValue}>{app.programManual || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Program Default</span>
                <span className={styles.fieldValue}>{app.programDefault || '—'}</span>
              </div>
            </div>
          </div>

          {/* 🚘 Collateral Details */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>🚘</span>
              <h3 className={styles.sectionTitle}>Collateral & Vehicle Info</h3>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Collateral Year</span>
                <span className={styles.fieldValue}>{app.collateralYear || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Collateral Type</span>
                <span className={styles.fieldValue}>{app.collateralType || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>New / Used</span>
                <span className={styles.fieldValue}>{app.collateralNewUsed || '—'}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Application Class</span>
                <span className={styles.fieldValue}>{app.applicationClass || '—'}</span>
              </div>
            </div>
          </div>

          {/* ⏱️ Pipeline Timings & Dates */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>⏱️</span>
              <h3 className={styles.sectionTitle}>Dates & Turnaround Performance</h3>
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Application Date</span>
                <span className={styles.fieldValue}>{formatDate(app.applicationDate)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Approval Date</span>
                <span className={styles.fieldValue}>{formatDate(app.approvalDate)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Booked Date</span>
                <span className={styles.fieldValue}>{formatDate(app.bookedDate)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Days Ago</span>
                <span className={`${styles.fieldValue} ${styles.fieldValueMono}`}>
                  {app.daysAgo != null ? `${app.daysAgo}d ago` : '—'}
                </span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Time to Decision</span>
                <span className={styles.fieldValue}>{formatDays(app.timeToDecision)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Time to Book</span>
                <span className={styles.fieldValue}>{formatDays(app.timeToBook)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Time to Last Fund</span>
                <span className={styles.fieldValue}>{formatDays(app.timeToLastFund)}</span>
              </div>
              <div className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Decision to Contract</span>
                <span className={styles.fieldValue}>
                  {formatDays(app.timeToLastDecisionToLastContract)}
                </span>
              </div>
            </div>
          </div>

          {/* 🏷️ Flags & Attributes */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span style={{ fontSize: '1rem' }}>🏷️</span>
              <h3 className={styles.sectionTitle}>Application Status Flags</h3>
            </div>
            <div className={styles.tagRow}>
              <span
                className={`${styles.flagBadge} ${
                  app.wasApproved ? styles.flagTrue : styles.flagFalse
                }`}
              >
                Approved: {app.wasApproved ? 'Yes' : 'No'}
              </span>
              <span
                className={`${styles.flagBadge} ${
                  app.wasApprovedNotBooked ? styles.flagTrue : styles.flagFalse
                }`}
              >
                Approved Not Booked: {app.wasApprovedNotBooked ? 'Yes' : 'No'}
              </span>
              <span
                className={`${styles.flagBadge} ${
                  app.isBusinessApp ? styles.flagTrue : styles.flagFalse
                }`}
              >
                Business App: {app.isBusinessApp ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
