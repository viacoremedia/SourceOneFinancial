import { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../../../features/auth/hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { SettingsPanel } from '../../../features/auth/components/SettingsPanel';
import { DigestPanel } from '../../../features/auth/components/DigestPanel';
import { RepScorecard } from '../../../features/dashboard/components/RepScorecard';
import { UnderwriterScorecard, type UnderwriterDateRange } from '../../../features/dashboard/components/UnderwriterScorecard/UnderwriterScorecard';
import { ScorecardReports } from '../../../features/dashboard/components/ScorecardReports/ScorecardReports';
import { PatchNotesModal } from '../../../features/dashboard/components/PatchNotesModal';
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
  onOpenCentralPipeline?: () => void;
  onOpenMoMAnalytics?: () => void;
  onOpenVisitImpact?: () => void;
  onOpenSystemAudit?: () => void;
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
  onOpenCentralPipeline,
  onOpenMoMAnalytics,
  onOpenVisitImpact,
  onOpenSystemAudit
}: AppShellProps) {
  const { user } = useAuth();
  const { mode, toggleTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [digestOpen, setDigestOpen] = useState(false);
  const [scorecardOpen, setScorecardOpen] = useState(false);
  const [scorecardReportsOpen, setScorecardReportsOpen] = useState(false);
  const [underwriterOpen, setUnderwriterOpen] = useState(false);
  const [patchNotesOpen, setPatchNotesOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isInsideRep = user?.role === 'inside_rep';

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
        {/* Top Row: Brand & Status / Global Controls */}
        <div className={styles.headerTopRow}>
          <div className={styles.brand}>
            <div className={styles.brandLogoContainer}>
              <img
                src="/sourceonelogo.png"
                alt="Source One Financial Services"
                className={styles.brandLogo}
              />
            </div>
            <span className={styles.brandTag}>Dealer Analytics</span>
          </div>

          <div className={styles.headerTopRight}>
            {formattedDate && (
              <div className={styles.reportDate}>
                <span className={styles.livePulse} />
                <span className={styles.reportDateLabel}>Latest Report:</span>
                <strong>{formattedDate}</strong>
              </div>
            )}

            <div className={styles.topUtilities}>
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

              <button
                className={styles.navCell}
                onClick={() => setPatchNotesOpen(true)}
                title="System Release Notes & What's New"
                id="patch-notes-header-btn"
                aria-label="Release Notes"
              >
                <Sparkles size={14} color="#2563eb" />
                <span>Patch v1.6</span>
              </button>

              <button
                className={`${styles.navCell} ${styles.themeToggleBtn}`}
                onClick={toggleTheme}
                title={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                id="theme-toggle-btn"
                aria-label={mode === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              >
                {mode === 'light' ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <span>Dark Mode</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    <span>Light Mode</span>
                  </>
                )}
              </button>

              <BugReporter mode="header" className={styles.navCell} user={user ? { name: user.name, email: user.email } : undefined} />
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
        </div>

        {/* Dedicated Navigation Bar Row */}
        {user && (
          <nav className={styles.navBarRow} aria-label="Main Navigation">
            <div className={styles.navBarLeft}>
              {onOpenCentralPipeline && (
                <button
                  className={`${styles.navCell} ${styles.navCellFeatured}`}
                  onClick={onOpenCentralPipeline}
                  title="Company-Wide Central Opportunity Pipeline"
                  id="central-pipeline-btn"
                  aria-label="Central Pipeline"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>Central Pipeline</span>
                </button>
              )}

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

              {!isInsideRep && (
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
            </div>
          </nav>
        )}
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
              <button
                className={styles.mobileDrawerItem}
                onClick={() => { toggleTheme(); setMobileMenuOpen(false); }}
              >
                {mode === 'light' ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                    <span>Switch to Dark Mode</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/></svg>
                    <span>Switch to Light Mode</span>
                  </>
                )}
              </button>
              {onOpenCentralPipeline && (
                <button
                  className={styles.mobileDrawerItem}
                  onClick={() => { setMobileMenuOpen(false); onOpenCentralPipeline(); }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                  <span>Central Pipeline</span>
                </button>
              )}
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
                  <span>Relationship Demand & Visit Impact</span>
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
                  {!isInsideRep && (
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
                  <button
                    className={styles.mobileDrawerItem}
                    onClick={() => { setMobileMenuOpen(false); setPatchNotesOpen(true); }}
                  >
                    <Sparkles size={18} color="#2563eb" />
                    <span>Patch v1.6 Notes</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <main className={styles.content}>{children}</main>

      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onOpenSystemAudit={onOpenSystemAudit} />
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
      <PatchNotesModal isOpen={patchNotesOpen} onClose={() => setPatchNotesOpen(false)} />
    </div>
  );
}
