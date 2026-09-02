import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { AuthUser } from '../types';
import api, {
  getDeadDealers,
  reviveDealer,
  syncBadgerAll,
  getBadgerSyncStatus,
  syncDealerBadger,
  getExcludedDealers,
  excludeDealer,
  type DeadDealerItem
} from '../../../core/services/api';
import styles from './Settings.module.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  inside_rep: 'Inside Rep',
  admin: 'Admin',
  super_admin: 'Super Admin',
};
const ROLE_HIERARCHY: Record<string, number> = { employee: 0, inside_rep: 0, admin: 1, super_admin: 2 };

function formatLoginTime(isoString?: string | null): { formatted: string; relative: string; isRecent: boolean } | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const dayName = dayNames[d.getDay()];
  const monthName = monthNames[d.getMonth()];
  const dateNum = d.getDate();
  
  const nth = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  let hours = d.getHours();
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const timeStr = `${hours}:${minutes} ${ampm}`;

  const now = Date.now();
  const diffMs = Math.max(0, now - d.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  let relative = '';
  if (diffSec < 45) {
    relative = 'just now';
  } else if (diffMin < 60) {
    relative = `${diffMin} ${diffMin === 1 ? 'min' : 'mins'} ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 30) {
    relative = `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else {
    const diffMonths = Math.floor(diffDays / 30);
    relative = `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  }

  const formatted = `${dayName} the ${dateNum}${nth(dateNum)} (${monthName} ${dateNum}) at ${timeStr}`;
  const isRecent = diffHours < 12;

  return { formatted, relative, isRecent };
}

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { user, logout } = useAuth();
  const isAdmin = user && ROLE_HIERARCHY[user.role] >= 1;
  const isInsideRep = user && user.role === 'inside_rep';

  // Active Tab: 'account' | 'team' | 'dead_dealers' | 'badger_sync' | 'reports' | 'excluded'
  const [activeTab, setActiveTab] = useState<'account' | 'team' | 'dead_dealers' | 'badger_sync' | 'reports' | 'excluded'>('account');

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // User list + invite
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [repOptions, setRepOptions] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'admin'>('employee');
  const [inviteName, setInviteName] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Inside Rep direct creation
  const [repEmail, setRepEmail] = useState('');
  const [repPassword, setRepPassword] = useState('');
  const [repName, setRepName] = useState('');
  const [repAssignedRep, setRepAssignedRep] = useState('');
  const [repMsg, setRepMsg] = useState('');
  const [repLoading, setRepLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');

  // Report recipients
  const [recipients, setRecipients] = useState<{ _id: string; email: string; createdAt: string }[]>([]);
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [recipientMsg, setRecipientMsg] = useState('');
  const [recipientLoading, setRecipientLoading] = useState(false);

  // Dead Dealers Graveyard
  const [deadDealers, setDeadDealers] = useState<DeadDealerItem[]>([]);
  const [deadLoading, setDeadLoading] = useState(false);
  const [deadMsg, setDeadMsg] = useState('');

  // Badger Maps Sync
  const [badgerStatus, setBadgerStatus] = useState<any>(null);
  const [badgerTriggerMsg, setBadgerTriggerMsg] = useState('');
  const [singleDealerInput, setSingleDealerInput] = useState('');
  const [singleSyncMsg, setSingleSyncMsg] = useState('');
  const [singleSyncLoading, setSingleSyncLoading] = useState(false);

  // Excluded Accounts (for Inside Reps)
  const [excludedList, setExcludedList] = useState<any[]>([]);
  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excludedMsg, setExcludedMsg] = useState('');

  const loadDeadDealers = async () => {
    if (!isAdmin) return;
    setDeadLoading(true);
    try {
      const res = await getDeadDealers();
      setDeadDealers(res.dealers || []);
    } catch (err: any) {
      console.error('Failed to load dead dealers:', err);
    } finally {
      setDeadLoading(false);
    }
  };

  const loadBadgerStatus = async () => {
    try {
      const res = await getBadgerSyncStatus();
      setBadgerStatus(res.status);
    } catch (err) {
      console.error('Failed to load Badger sync status:', err);
    }
  };

  const loadExcludedDealers = async () => {
    setExcludedLoading(true);
    try {
      const res = await getExcludedDealers();
      setExcludedList(res.dealers || []);
    } catch (err) {
      console.error('Failed to load excluded dealers:', err);
    } finally {
      setExcludedLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      if (isAdmin) {
        api.get('/auth/users').then(({ data }) => setUsers(data.users)).catch(() => {});
        api.get('/auth/rep-list').then(({ data }) => { if (data?.reps) setRepOptions(data.reps); }).catch(() => {});
        api.get('/reports/recipients').then(({ data }) => setRecipients(data.recipients)).catch(() => {});
        loadDeadDealers();
        loadBadgerStatus();
      }
      if (isInsideRep) {
        loadExcludedDealers();
      }
    }
  }, [open, isAdmin, isInsideRep]);

  // Poll Badger status if running
  useEffect(() => {
    if (!open || !isAdmin) return;
    if (badgerStatus?.isRunning) {
      const interval = setInterval(loadBadgerStatus, 2000);
      return () => clearInterval(interval);
    }
  }, [open, isAdmin, badgerStatus?.isRunning]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setPwMsg('✅ Password updated successfully');
      setCurrentPw('');
      setNewPw('');
    } catch (err: any) {
      setPwMsg(`❌ ${err.response?.data?.message || 'Failed'}`);
    } finally {
      setPwLoading(false);
    }
  };

  const handleInvite = async (e: FormEvent) => {
    e.preventDefault();
    setInviteMsg('');
    setInviteLoading(true);
    try {
      await api.post('/auth/invite', { email: inviteEmail, role: inviteRole, name: inviteName });
      setInviteMsg(`✅ Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteName('');
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err: any) {
      setInviteMsg(`❌ ${err.response?.data?.message || 'Failed to send invite'}`);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCreateRepAccount = async (e: FormEvent) => {
    e.preventDefault();
    setRepMsg('');
    setRepLoading(true);
    try {
      await api.post('/auth/create-rep-user', {
        email: repEmail,
        password: repPassword,
        name: repName,
        assignedRep: repAssignedRep,
      });
      setRepMsg(`✅ Inside Rep account created for ${repEmail} (${repAssignedRep})`);
      setRepEmail('');
      setRepPassword('');
      setRepName('');
      setRepAssignedRep('');
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err: any) {
      setRepMsg(`❌ ${err.response?.data?.message || 'Failed to create account'}`);
    } finally {
      setRepLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const uid = deleteTarget._id || deleteTarget.id;
    try {
      await api.delete(`/auth/users/${uid}`);
      setUsers((prev) => prev.filter((u) => (u._id || u.id) !== uid));
      setDeleteTarget(null);
      setDeleteConfirmEmail('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove user');
    }
  };

  const handleReviveDealer = async (dealerId: string) => {
    if (!window.confirm(`Revive dealer ${dealerId} back to active status?`)) return;
    try {
      const res = await reviveDealer(dealerId);
      setDeadMsg(`✅ ${res.message}`);
      loadDeadDealers();
    } catch (err: any) {
      setDeadMsg(`❌ ${err.message || 'Failed to revive dealer'}`);
    }
  };

  const handleStartBadgerSync = async () => {
    if (!window.confirm('Start network-wide Badger Maps sync in background?')) return;
    try {
      const res = await syncBadgerAll();
      setBadgerTriggerMsg(`🚀 ${res.message}`);
      loadBadgerStatus();
    } catch (err: any) {
      setBadgerTriggerMsg(`❌ ${err.message || 'Failed to start sync'}`);
    }
  };

  const handleSingleDealerSync = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleDealerInput.trim()) return;
    setSingleSyncLoading(true);
    setSingleSyncMsg('');
    try {
      const res = await syncDealerBadger(singleDealerInput.trim());
      setSingleSyncMsg(`✅ Synced ${res.data?.contacts?.length || 0} contacts for ${singleDealerInput.toUpperCase()}`);
      setSingleDealerInput('');
    } catch (err: any) {
      setSingleSyncMsg(`❌ ${err.message || 'Dealer not found in Badger Maps'}`);
    } finally {
      setSingleSyncLoading(false);
    }
  };

  const handleRestoreExcludedDealer = async (dealerId: string) => {
    try {
      await excludeDealer(dealerId, false);
      setExcludedMsg(`✅ Dealer ${dealerId} restored to portfolio`);
      loadExcludedDealers();
    } catch (err: any) {
      setExcludedMsg(`❌ ${err.message || 'Failed to restore dealer'}`);
    }
  };

  const myLevel = user ? ROLE_HIERARCHY[user.role] : 0;
  const syncProgressPct = badgerStatus?.total > 0
    ? Math.min(100, Math.round((badgerStatus.processed / badgerStatus.total) * 100))
    : 0;

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Panel */}
      <div className={styles.panel} style={{ width: isAdmin || isInsideRep ? 'min(640px, 96vw)' : '420px' }}>
        <div className="mobileDragHandleRow">
          <div className="mobileDragHandle" />
        </div>
        <div className={styles.panelHeader}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Top Navigation Tabs */}
        <div className={styles.tabBar}>
          <button
            className={`${styles.tabBtn} ${activeTab === 'account' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('account')}
          >
            👤 Account
          </button>
          {isAdmin && (
            <>
              <button
                className={`${styles.tabBtn} ${activeTab === 'team' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('team')}
              >
                👥 Team ({users.length})
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'dead_dealers' ? styles.tabBtnActive : ''}`}
                onClick={() => { setActiveTab('dead_dealers'); loadDeadDealers(); }}
              >
                🪦 Dead Dealers {deadDealers.length > 0 && <span className={styles.tabBadge}>{deadDealers.length}</span>}
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'badger_sync' ? styles.tabBtnActive : ''}`}
                onClick={() => { setActiveTab('badger_sync'); loadBadgerStatus(); }}
              >
                🔄 Badger Maps
              </button>
              <button
                className={`${styles.tabBtn} ${activeTab === 'reports' ? styles.tabBtnActive : ''}`}
                onClick={() => setActiveTab('reports')}
              >
                📊 Digest Emails
              </button>
            </>
          )}
          {isInsideRep && (
            <button
              className={`${styles.tabBtn} ${activeTab === 'excluded' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('excluded'); loadExcludedDealers(); }}
            >
              🚫 Excluded Dealers ({excludedList.length})
            </button>
          )}
        </div>

        {/* TAB 1: ACCOUNT & PASSWORD */}
        {activeTab === 'account' && (
          <>
            <section className={styles.section}>
              <h3>Profile</h3>
              <div className={styles.profileInfo}>
                <span>{user?.name || user?.email}</span>
                <span className={`${styles.roleBadge} ${styles[`role_${user?.role || 'employee'}`]}`}>
                  {ROLE_LABELS[user?.role || 'employee']}
                </span>
                {user?.assignedRep && (
                  <span className={styles.repBadge}>
                    Rep: {user.assignedRep}
                  </span>
                )}
              </div>
            </section>

            <section className={styles.section}>
              <h3>Change Password</h3>
              <form onSubmit={handleChangePassword} className={styles.inlineForm}>
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Current password"
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="New password (min 6 chars)"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  required
                />
                <button className={styles.btn} type="submit" disabled={pwLoading}>
                  {pwLoading ? 'Updating...' : 'Update Password'}
                </button>
                {pwMsg && <div className={styles.msg}>{pwMsg}</div>}
              </form>
            </section>

            <section className={styles.section}>
              <button className={styles.logoutBtn} onClick={logout}>
                Sign Out
              </button>
            </section>
          </>
        )}

        {/* TAB 2: TEAM & REPS (Admin) */}
        {isAdmin && activeTab === 'team' && (
          <>
            {/* Create Inside Rep Account */}
            <section className={styles.section}>
              <h3>Create Inside Sales Rep Account</h3>
              <p className={styles.recipientHint}>Directly create an active account mapped to an internal rep. Rep can log in immediately.</p>
              <form onSubmit={handleCreateRepAccount} className={styles.inlineForm}>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Rep Email"
                  value={repEmail}
                  onChange={(e) => setRepEmail(e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="password"
                  placeholder="Initial Password (min 6 chars)"
                  value={repPassword}
                  onChange={(e) => setRepPassword(e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Name (optional)"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                />
                <select
                  className={styles.select}
                  value={repAssignedRep}
                  onChange={(e) => setRepAssignedRep(e.target.value)}
                  required
                >
                  <option value="">-- Select Internal Rep Mapping --</option>
                  {repOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <button className={styles.btn} type="submit" disabled={repLoading}>
                  {repLoading ? 'Creating...' : 'Create Account'}
                </button>
                {repMsg && <div className={styles.msg}>{repMsg}</div>}
              </form>
            </section>

            {/* Invite Admin / Employee */}
            <section className={styles.section}>
              <h3>Invite Admin / Employee</h3>
              <form onSubmit={handleInvite} className={styles.inlineForm}>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Name (optional)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
                <select
                  className={styles.select}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'employee' | 'admin')}
                >
                  <option value="employee">Employee</option>
                  {myLevel >= 2 && <option value="admin">Admin</option>}
                </select>
                <button className={styles.btn} type="submit" disabled={inviteLoading}>
                  {inviteLoading ? 'Sending...' : 'Send Invite'}
                </button>
                {inviteMsg && <div className={styles.msg}>{inviteMsg}</div>}
              </form>
            </section>

            {/* User Roster */}
            <section className={styles.section}>
              <h3>Team Accounts ({users.length})</h3>
              <div className={styles.userList}>
                {users.map((u) => {
                  const uid = u._id || u.id;
                  const canRemove =
                    uid !== (user?._id || user?.id) &&
                    ROLE_HIERARCHY[u.role] < myLevel;
                  const loginInfo = formatLoginTime(u.lastLoginAt);
                  return (
                    <div key={uid} className={styles.userRow}>
                      <div className={styles.userInfo}>
                        <div className={styles.userNameRow}>
                          <span className={styles.userName}>{u.name || u.email}</span>
                          {u.assignedRep && (
                            <span className={styles.repBadge}>
                              Rep: {u.assignedRep}
                            </span>
                          )}
                        </div>
                        <span className={styles.userEmail}>{u.email}</span>
                        <div className={styles.userLoginMeta}>
                          {loginInfo ? (
                            <span className={`${styles.lastLoginTag} ${loginInfo.isRecent ? styles.lastLoginRecent : ''}`}>
                              <span className={styles.loginDot} />
                              Last login: <strong>{loginInfo.formatted}</strong> ({loginInfo.relative})
                              {u.loginCount && u.loginCount > 1 ? ` • ${u.loginCount} logins` : ''}
                            </span>
                          ) : (
                            <span className={styles.neverLoginTag}>
                              {u.status === 'invited' ? '✉️ Invited — No logins yet' : '⚪ Never logged in'}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`${styles.roleBadge} ${styles[`role_${u.role}`]}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                      <span className={`${styles.statusDot} ${styles[`status_${u.status}`]}`}>
                        {u.status}
                      </span>
                      {canRemove && (
                        <button
                          className={styles.removeBtn}
                          onClick={() => { setDeleteTarget(u); setDeleteConfirmEmail(''); }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {/* TAB 3: DEAD DEALERS GRAVEYARD (Admin) */}
        {isAdmin && activeTab === 'dead_dealers' && (
          <section className={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>Dead Dealers Graveyard ({deadDealers.length})</h3>
                <p className={styles.recipientHint}>
                  Dealers marked as closed, bought out, or no longer in service. Excluded system-wide from tables, DRD, and digests.
                </p>
              </div>
              <button className={styles.btn} onClick={loadDeadDealers} disabled={deadLoading}>
                {deadLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {deadMsg && <div className={styles.msg} style={{ marginTop: '8px' }}>{deadMsg}</div>}

            {deadDealers.length === 0 ? (
              <div className={styles.recipientEmpty} style={{ padding: '24px 0', textAlign: 'center' }}>
                🎉 No dead dealers flagged! All accounts in the system are currently active.
              </div>
            ) : (
              <div className={styles.deadTableContainer}>
                <table className={styles.deadTable}>
                  <thead>
                    <tr>
                      <th>Dealer</th>
                      <th>Status</th>
                      <th>Reason & Flagged By</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadDealers.map((d) => (
                      <tr key={d._id}>
                        <td>
                          <div style={{ fontWeight: 600 }}>{d.dealerName}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>
                            {d.dealerId} {d.statePrefix ? `• ${d.statePrefix}` : ''} {d.dealerRepresentative ? `• Rep: ${d.dealerRepresentative}` : ''}
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.deadBadge} ${styles[`deadBadge_${d.systemStatus}`]}`}>
                            {d.systemStatus === 'closed' && '🚫 Closed'}
                            {d.systemStatus === 'bought_out' && '🤝 Bought Out'}
                            {d.systemStatus === 'no_longer_in_service' && '⚠️ Out of Service'}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: '11px', color: '#cbd5e1' }}>{d.systemStatusReason || 'Manually flagged'}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                            {d.systemStatusChangedBy ? `By ${d.systemStatusChangedBy}` : ''}
                            {d.systemStatusChangedAt ? ` on ${new Date(d.systemStatusChangedAt).toLocaleDateString()}` : ''}
                          </div>
                        </td>
                        <td>
                          <button
                            className={styles.reviveBtn}
                            onClick={() => handleReviveDealer(d.dealerId)}
                            title="Restore dealer back to active state"
                          >
                            ✨ Revive
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* TAB 4: BADGER MAPS SYNC & BACKFILL (Admin) */}
        {isAdmin && activeTab === 'badger_sync' && (
          <>
            <section className={styles.section}>
              <h3>Badger Maps Ingestion Engine</h3>
              <p className={styles.recipientHint}>
                Synchronizes multi-contact rosters (Names, Phone, Email), rep communication history, and GPS coordinates from Badger Maps.
              </p>

              {/* Status Card */}
              <div className={styles.syncCard}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
                    Engine Status: <strong style={{ color: badgerStatus?.isRunning ? '#38bdf8' : '#4ade80' }}>
                      {badgerStatus?.isRunning ? '⚡ SYNCING IN BACKGROUND' : (badgerStatus?.lastStatus?.toUpperCase() || 'IDLE')}
                    </strong>
                  </span>
                  <button className={styles.btn} onClick={loadBadgerStatus}>Status Check</button>
                </div>

                {badgerStatus?.message && (
                  <div style={{ fontSize: '12px', color: '#94a3b8' }}>{badgerStatus.message}</div>
                )}

                {badgerStatus?.isRunning && (
                  <>
                    <div className={styles.progressBarContainer}>
                      <div className={styles.progressBarFill} style={{ width: `${syncProgressPct}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                      <span>{badgerStatus.processed} / {badgerStatus.total} accounts processed</span>
                      <span>{syncProgressPct}%</span>
                    </div>
                  </>
                )}

                <div className={styles.syncStatsRow}>
                  <div className={styles.syncStatPill}>
                    <div className={styles.syncStatLabel}>Total In Badger</div>
                    <div className={styles.syncStatValue}>{badgerStatus?.total || '5,603'}</div>
                  </div>
                  <div className={styles.syncStatPill}>
                    <div className={styles.syncStatLabel}>Matched & Updated</div>
                    <div className={styles.syncStatValue} style={{ color: '#4ade80' }}>{badgerStatus?.updated || 0}</div>
                  </div>
                  <div className={styles.syncStatPill}>
                    <div className={styles.syncStatLabel}>Errors</div>
                    <div className={styles.syncStatValue} style={{ color: badgerStatus?.errors?.length ? '#f87171' : '#94a3b8' }}>
                      {badgerStatus?.errors?.length || 0}
                    </div>
                  </div>
                </div>

                <div className={styles.syncActionRow}>
                  <button
                    className={styles.btn}
                    onClick={handleStartBadgerSync}
                    disabled={badgerStatus?.isRunning}
                    style={{ background: 'linear-gradient(135deg, #0284c7, #2563eb)', border: 'none', color: '#fff', fontWeight: 600 }}
                  >
                    {badgerStatus?.isRunning ? 'Sync Running...' : '🚀 Start Full Network Sync'}
                  </button>
                </div>
                {badgerTriggerMsg && <div className={styles.msg}>{badgerTriggerMsg}</div>}
              </div>
            </section>

            {/* Single Dealer On-Demand Test Sync */}
            <section className={styles.section}>
              <h3>Sync Single Dealer (Instant)</h3>
              <p className={styles.recipientHint}>Test or immediately sync a specific dealership ID (e.g. WI113, OK116, TX400).</p>
              <form onSubmit={handleSingleDealerSync} className={styles.inlineForm}>
                <input
                  className={styles.input}
                  type="text"
                  placeholder="Dealer ID (e.g. WI113)"
                  value={singleDealerInput}
                  onChange={(e) => setSingleDealerInput(e.target.value)}
                  required
                />
                <button className={styles.btn} type="submit" disabled={singleSyncLoading}>
                  {singleSyncLoading ? 'Syncing...' : 'Sync Dealer'}
                </button>
                {singleSyncMsg && <div className={styles.msg}>{singleSyncMsg}</div>}
              </form>
            </section>
          </>
        )}

        {/* TAB 5: DIGEST RECIPIENTS (Admin) */}
        {isAdmin && activeTab === 'reports' && (
          <section className={styles.section}>
            <h3>Automated Daily Digest Email Recipients</h3>
            <p className={styles.recipientHint}>Emails that receive automated daily executive digests and portfolio health reports.</p>
            <form
              className={styles.recipientForm}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newRecipientEmail.trim()) return;
                setRecipientMsg('');
                setRecipientLoading(true);
                try {
                  await api.post('/reports/recipients', { email: newRecipientEmail.trim() });
                  setRecipientMsg(`✅ Added ${newRecipientEmail.trim()}`);
                  setNewRecipientEmail('');
                  const { data } = await api.get('/reports/recipients');
                  setRecipients(data.recipients);
                } catch (err: any) {
                  setRecipientMsg(`❌ ${err.response?.data?.message || 'Failed to add'}`);
                } finally {
                  setRecipientLoading(false);
                }
              }}
            >
              <div className={styles.recipientInputRow}>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="email@example.com"
                  value={newRecipientEmail}
                  onChange={(e) => setNewRecipientEmail(e.target.value)}
                  required
                />
                <button className={styles.btn} type="submit" disabled={recipientLoading}>
                  {recipientLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
              {recipientMsg && <div className={styles.msg}>{recipientMsg}</div>}
            </form>
            {recipients.length > 0 && (
              <div className={styles.recipientList}>
                {recipients.map((r) => (
                  <div key={r._id} className={styles.recipientRow}>
                    <span className={styles.recipientEmail}>{r.email}</span>
                    <button
                      className={styles.removeBtn}
                      onClick={async () => {
                        try {
                          await api.delete(`/reports/recipients/${r._id}`);
                          setRecipients((prev) => prev.filter((x) => x._id !== r._id));
                        } catch (err: any) {
                          alert(err.response?.data?.message || 'Failed to remove');
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* TAB 6: EXCLUDED DEALERS (Inside Rep) */}
        {isInsideRep && activeTab === 'excluded' && (
          <section className={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3>My Excluded Accounts ({excludedList.length})</h3>
                <p className={styles.recipientHint}>
                  Dealerships you have excluded from your personal portfolio view and metrics.
                </p>
              </div>
              <button className={styles.btn} onClick={loadExcludedDealers} disabled={excludedLoading}>
                {excludedLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {excludedMsg && <div className={styles.msg} style={{ marginTop: '8px' }}>{excludedMsg}</div>}

            {excludedList.length === 0 ? (
              <div className={styles.recipientEmpty} style={{ padding: '24px 0', textAlign: 'center' }}>
                ⭐ You have not excluded any accounts. You are viewing your full assigned territory.
              </div>
            ) : (
              <div className={styles.excludedList}>
                {excludedList.map((d) => (
                  <div key={d._id || d.dealerId} className={styles.excludedItem}>
                    <div className={styles.excludedItemInfo}>
                      <span className={styles.excludedItemName}>{d.dealerName}</span>
                      <span className={styles.excludedItemMeta}>
                        ID: {d.dealerId} {d.statePrefix ? `• State: ${d.statePrefix}` : ''} {d.dealerPhoneNumber ? `• Phone: ${d.dealerPhoneNumber}` : ''}
                      </span>
                    </div>
                    <button
                      className={styles.restoreBtn}
                      onClick={() => handleRestoreExcludedDealer(d.dealerId)}
                    >
                      Restore to Portfolio
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h3>Remove User</h3>
            <p>
              Are you sure you want to remove <strong>{deleteTarget.email}</strong>?
              This action is permanent.
            </p>
            <p className={styles.confirmHint}>
              Type <strong>{deleteTarget.email}</strong> to confirm:
            </p>
            <input
              className={styles.input}
              type="text"
              value={deleteConfirmEmail}
              onChange={(e) => setDeleteConfirmEmail(e.target.value)}
              placeholder={deleteTarget.email}
            />
            <div className={styles.modalActions}>
              <button className={styles.btn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                className={styles.dangerBtn}
                disabled={deleteConfirmEmail !== deleteTarget.email}
                onClick={handleDelete}
              >
                Confirm Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
