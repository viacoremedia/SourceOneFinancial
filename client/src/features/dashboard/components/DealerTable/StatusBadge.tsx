/**
 * Status badge rendering helper.
 */

import type { ActivityStatus } from '../../types';
import styles from './DealerTable.module.css';

const STATUS_CONFIG: Record<
  ActivityStatus,
  { label: string; className: string }
> = {
  active: { label: 'Active', className: styles.statusActive },
  '30d_inactive': { label: '30d', className: styles.status30d },
  '60d_inactive': { label: '60d', className: styles.status60d },
  long_inactive: { label: 'Long', className: styles.statusLong },
  never_active: { label: 'Never', className: styles.statusNever },
};

interface StatusBadgeProps {
  status: ActivityStatus | null | undefined;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return <span className={styles.emptyValue}>—</span>;
  }

  const config = STATUS_CONFIG[status] || STATUS_CONFIG.never_active;

  return (
    <span className={`${styles.statusBadge} ${config.className}`}>
      {config.label}
    </span>
  );
}
