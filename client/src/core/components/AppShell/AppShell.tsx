import { useState, type ReactNode } from 'react';
import { useAuth } from '../../../features/auth/hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { SettingsPanel } from '../../../features/auth/components/SettingsPanel';
import { DigestPanel } from '../../../features/auth/components/DigestPanel';
import { RepScorecard } from '../../../features/dashboard/components/RepScorecard';
import styles from './AppShell.module.css';
import type { RollingWindow } from '../../../features/dashboard/types';

interface AppShellProps {
  children: ReactNode;
  latestReportDate?: string | null;
  rollingWindow?: RollingWindow;
  onRollingWindowChange?: (w: RollingWindow) => void;
  onSelectRep?: (rep: string) => void;
  onSelectRepState?: (rep: string, state: string) => void;
  activityMode?: string;
  onActivityModeChange?: (mode: 'application' | 'approval' | 'booking') => void;
}

// SVG theme icons (Lucide-style, 18px)
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const THEME_ICON_MAP: Record<string, () => React.JSX.Element> = {
  light: SunIcon,
  dark: MoonIcon,
};

const THEME_LABELS: Record<string, string> = {
  light: 'Light mode',
  dark: 'Dark mode',
};

export function AppShell({ children, latestReportDate, rollingWindow = 7, onRollingWindowChange, onSelectRep, onSelectRepState, activityMode, onActivityModeChange }: AppShellProps) {
  const { user } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);

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
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            title={THEME_LABELS[mode]}
            id="theme-toggle-btn"
            aria-label={`Theme: ${THEME_LABELS[mode]}`}
          >
            {(THEME_ICON_MAP[mode] || SunIcon)()}
          </button>
          {user && (
            <>
              <button
                className={styles.settingsBtn}
                onClick={() => setScorecardOpen(true)}
                title="Rep Scorecard"
                id="scorecard-btn"
                aria-label="Rep Scorecard"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
              </button>
              <button
                className={styles.settingsBtn}
                onClick={() => setDigestOpen(true)}
                title="Daily Digest"
                id="digest-btn"
                aria-label="Daily Digest"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>
              </button>
              <button
                className={styles.settingsBtn}
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                id="settings-btn"
                aria-label="Settings"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            </>
          )}
        </div>
      </header>
      <main className={styles.content}>{children}</main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <DigestPanel open={digestOpen} onClose={() => setDigestOpen(false)} latestReportDate={latestReportDate} />
      <RepScorecard
        open={scorecardOpen}
        onClose={() => setScorecardOpen(false)}
        windowSize={rollingWindow}
        onWindowChange={onRollingWindowChange || (() => {})}
        onSelectRep={onSelectRep}
        onSelectRepState={onSelectRepState}
        activityMode={activityMode}
        onActivityModeChange={onActivityModeChange}
      />
    </div>
  );
}
