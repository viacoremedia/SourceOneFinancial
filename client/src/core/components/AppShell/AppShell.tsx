import { useState, type ReactNode } from 'react';
import { useAuth } from '../../../features/auth/hooks/useAuth';
import { SettingsPanel } from '../../../features/auth/components/SettingsPanel';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: ReactNode;
  latestReportDate?: string | null;
}

export function AppShell({ children, latestReportDate }: AppShellProps) {
  const { user } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const formattedDate = latestReportDate
    ? (() => {
        // Parse as UTC to avoid timezone shift (API sends midnight UTC)
        const d = new Date(latestReportDate);
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        });
      })()
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
          {user && (
            <button
              className={styles.settingsBtn}
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              id="settings-btn"
            >
              ⚙
            </button>
          )}
        </div>
      </header>
      <main className={styles.content}>{children}</main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
