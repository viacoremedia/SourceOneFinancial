import styles from './StatsBar.module.css';
import type { OverviewStats } from '../../types';

interface StatsBarProps {
  data: OverviewStats | null;
  isLoading: boolean;
}

export function StatsBar({ data, isLoading }: StatsBarProps) {
  if (isLoading) {
    return (
      <div className={styles.statsBar} id="stats-bar">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={styles.statCard}>
            <div className={`${styles.skeleton} ${styles.skeletonLabel}`} />
            <div className={`${styles.skeleton} ${styles.skeletonValue}`} />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const activeCount =
    data.statusBreakdown.find((s) => s.status === 'active')?.count ?? 0;
  const activePercent =
    data.totalDealers > 0
      ? Math.round((activeCount / data.totalDealers) * 100)
      : 0;

  const stats = [
    {
      label: 'Total Dealers',
      value: data.totalDealers.toLocaleString(),
      sub: `${data.totalGroups} groups`,
    },
    {
      label: 'Active Dealers',
      value: activeCount.toLocaleString(),
      sub: `${activePercent}% of total`,
      highlight: true,
    },
    {
      label: 'Avg Days Since App',
      value: data.activeDealerAvg
        ? data.activeDealerAvg.avgDaysSinceLastApp.toFixed(1)
        : '—',
      sub: 'Active dealers only',
    },
    {
      label: 'Reactivations MTD',
      value: data.reactivations.thisMonth.toLocaleString(),
      sub: `${data.reactivations.change >= 0 ? '+' : ''}${data.reactivations.change} vs last month`,
    },
  ];

  return (
    <div className={styles.statsBar} id="stats-bar">
      {stats.map((stat) => (
        <div key={stat.label} className={styles.statCard}>
          <div className={styles.statLabel}>{stat.label}</div>
          <div
            className={`${styles.statValue} ${stat.highlight ? styles.statHighlight : ''}`}
          >
            {stat.value}
          </div>
          {stat.sub && <div className={styles.statSub}>{stat.sub}</div>}
        </div>
      ))}
    </div>
  );
}
