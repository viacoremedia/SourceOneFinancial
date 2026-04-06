import { ReactNode } from 'react';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  latestReportDate?: string | null;
}

export function AppShell({ children, latestReportDate }: AppShellProps) {
  const formattedDate = latestReportDate
    ? new Date(latestReportDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className={styles.appShell}>
      <header className={styles.header} id="app-header">
        <div className={styles.brand}>
          <div className={styles.brandMark}>S1</div>
          <div>
            <div className={styles.brandName}>Source One</div>
            <div className={styles.brandTag}>Dealer Analytics</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          {formattedDate && (
            <div className={styles.reportDate}>
              <span className={styles.reportDateLabel}>Latest Report:</span>
              {formattedDate}
            </div>
          )}
        </div>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
