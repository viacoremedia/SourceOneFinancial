import { useState, type ReactNode } from 'react';
import { useAuth } from '../../../features/auth/hooks/useAuth';
import { SettingsPanel } from '../../../features/auth/components/SettingsPanel';
import { DigestPanel } from '../../../features/auth/components/DigestPanel';
import { RepScorecard } from '../../../features/dashboard/components/RepScorecard';
import { UnderwriterScorecard, type UnderwriterDateRange } from '../../../features/dashboard/components/UnderwriterScorecard/UnderwriterScorecard';
import { ScorecardReports } from '../../../features/dashboard/components/ScorecardReports/ScorecardReports';
import { BugReporter } from '../../../components/BugReporter';
import styles from './AppShell.module.css';
import type { RollingWindow } from '../../../features/dashboard/types';

interface AppShellProps {
  children: ReactNode;
  latestReportDate?: string | null;
  rollingWindow?: RollingWindow;
  onRollingWindowChange?: (w: RollingWindow) => void;
  onSelectRep?: (rep: string) => void;
  onSelectRepState?: (rep: string, state: string) => void;
  onSelectUnderwriter?: (underwriter: string, dateRange?: UnderwriterDateRange) => void;
  activityMode?: string;
  onActivityModeChange?: (mode: 'application' | 'approval' | 'booking') => void;
  onOpenMoMAnalytics?: () => void;
  onOpenVisitImpact?: () => void;
}

export function AppShell({
  children,
  latestReportDate,
  rollingWindow = 7,
  onRollingWindowChange,
  onSelectRep,
  onSelectRepState,
  onSelectUnderwriter,
  activityMode,
  onActivityModeChange,
  onOpenMoMAnalytics,
  onOpenVisitImpact
}: AppShellProps) {
  const { user } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [scorecardReportsOpen, setScorecardReportsOpen] = useState(false);
  const [underwriterOpen, setUnderwriterOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Whitelist check: only joshua@viacoremedia.com can see the PDF Reports feature
  const isJoshua = (user?.email?.toLowerCase().trim() === 'joshua@viacoremedia.com') || (typeof window !== 'undefined' && localStorage.getItem('ENABLE_TLC') === 'true');

  const formattedDate = latestReportDate
    ? (() => {
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
              <span className={styles.livePulse} />
              <span className={styles.reportDateLabel}>Latest Report:</span>
              <strong>{formattedDate}</strong>
            </div>
          )}

          <div className={styles.desktopHeaderButtons}>
            {user && (
              <div className={styles.navCellStrip}>
                {onOpenMoMAnalytics && (
                  <button
                    className={styles.navCell}
                    onClick={onOpenMoMAnalytics}
                    title="Historical Month-over-Month Analytics"
                    id="mom-analytics-btn"
                    aria-label="Historical MoM Analytics"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    <span>Historical MoM</span>
                  </button>
                )}

                {onOpenVisitImpact && (
                  <button
                    className={styles.navCell}
                    onClick={onOpenVisitImpact}
                    title="Sales Visit & Touchpoint Impact Engine"
                    id="visit-impact-btn"
                    aria-label="Visit Impact"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>Visit Impact</span>
                  </button>
                )}

                <button
                  className={styles.navCell}
                  onClick={() => setScorecardOpen(true)}
                  title="Rep Leaderboard & Scorecard"
                  id="scorecard-btn"
                  aria-label="Rep Scorecard"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                  <span>Rep Scorecard</span>
                </button>

                {isJoshua && (
                  <button
                    className={styles.navCell}
                    onClick={() => setScorecardReportsOpen(true)}
                    title="PDF Scorecard Reports & Executive Dispatch"
                    id="pdf-reports-btn"
                    aria-label="PDF Reports"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <span>PDF Reports</span>
                  </button>
                )}

                <button
                  className={styles.navCell}
                  onClick={() => setUnderwriterOpen(true)}
                  title="Underwriter & Lender Performance Scorecard"
                  id="underwriter-scorecard-btn"
                  aria-label="Underwriters"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                  <span>Underwriters</span>
                </button>

                <button
                  className={styles.navCell}
                  onClick={() => setDigestOpen(true)}
                  title="Daily Digest & Email Reports"
                  id="digest-btn"
                  aria-label="Daily Digest"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  <span>Daily Digest</span>
                </button>

                <div className={styles.navCellDivider} />

                <button
                  className={styles.navCell}
                  onClick={() => setSettingsOpen(true)}
                  title="Settings & System Config"
                  id="settings-btn"
                  aria-label="Settings"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  <span>Settings</span>
                </button>

                <BugReporter mode="header" className={styles.navCell} user={user ? { name: user.name, email: user.email } : undefined} />
              </div>
            )}
          </div>

          {/* Mobile Quick Menu Button */}
          <button
            className={styles.mobileMenuTrigger}
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open Quick Actions Menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          </button>
        </div>
      </header>

      {/* Mobile Quick Actions Bottom Sheet */}
      {mobileMenuOpen && (
        <div className={styles.mobileDrawerBackdrop} onClick={() => setMobileMenuOpen(false)}>
          <div className={styles.mobileDrawer} onClick={(e) => e.stopPropagation()}>
            <div className="mobileDragHandleRow">
              <div className="mobileDragHandle" />
            </div>
            <div className={styles.mobileDrawerHeader}>
              <h3 className={styles.mobileDrawerTitle}>Quick Actions</h3>
              <button className={styles.mobileDrawerClose} onClick={() => setMobileMenuOpen(false)}>✕</button>
            </div>
            <div className={styles.mobileDrawerGrid}>
              {onOpenMoMAnalytics && (
                <button
                  className={styles.mobileDrawerItem}
                  onClick={() => { setMobileMenuOpen(false); onOpenMoMAnalytics(); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                  <span>Historical MoM Analytics</span>
                </button>
              )}
              {onOpenVisitImpact && (
                <button
                  className={styles.mobileDrawerItem}
                  onClick={() => { setMobileMenuOpen(false); onOpenVisitImpact(); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span>{user?.email?.toLowerCase().trim() === 'joshua@viacoremedia.com' ? 'Relationship Demand (DRD)' : 'Visit Impact'}</span>
                </button>
              )}
              {user && (
                <>
                  <button
                    className={styles.mobileDrawerItem}
                    onClick={() => { setMobileMenuOpen(false); setScorecardOpen(true); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/></svg>
                    <span>Rep Scorecard</span>
                  </button>
                  {isJoshua && (
                    <button
                      className={styles.mobileDrawerItem}
                      onClick={() => { setMobileMenuOpen(false); setScorecardReportsOpen(true); }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      <span>PDF Reports</span>
                    </button>
                  )}
                  <button
                    className={styles.mobileDrawerItem}
                    onClick={() => { setMobileMenuOpen(false); setUnderwriterOpen(true); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                    <span>Underwriters</span>
                  </button>
                  <button
                    className={styles.mobileDrawerItem}
                    onClick={() => { setMobileMenuOpen(false); setDigestOpen(true); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    <span>Daily Digest</span>
                  </button>
                  <button
                    className={styles.mobileDrawerItem}
                    onClick={() => { setMobileMenuOpen(false); setSettingsOpen(true); }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Settings</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

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
      <UnderwriterScorecard
        isOpen={underwriterOpen}
        onClose={() => setUnderwriterOpen(false)}
        onSelectUnderwriter={(uw, dateRange) => {
          onSelectUnderwriter?.(uw, dateRange);
        }}
      />
      {scorecardReportsOpen && (
        <ScorecardReports
          open={scorecardReportsOpen}
          onClose={() => setScorecardReportsOpen(false)}
          initialWindowSize={rollingWindow}
          initialActivityMode={activityMode as any}
        />
      )}
    </div>
  );
}
