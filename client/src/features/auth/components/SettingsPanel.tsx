import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import type { AuthUser } from '../types';
import api from '../../../core/services/api';
import styles from './Settings.module.css';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employee',
  admin: 'Admin',
  super_admin: 'Super Admin',
};
const ROLE_HIERARCHY: Record<string, number> = { employee: 0, admin: 1, super_admin: 2 };

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { user, logout } = useAuth();
  const isAdmin = user && ROLE_HIERARCHY[user.role] >= 1;

  // Password change
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  // User list + invite
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'employee' | 'admin'>('employee');
  const [inviteName, setInviteName] = useState('');
  const [inviteMsg, setInviteMsg] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<AuthUser | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');

  // Report recipients
  const [recipients, setRecipients] = useState<{ _id: string; email: string; createdAt: string }[]>([]);
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [recipientMsg, setRecipientMsg] = useState('');
  const [recipientLoading, setRecipientLoading] = useState(false);

  useEffect(() => {
    if (open && isAdmin) {
      api.get('/auth/users').then(({ data }) => setUsers(data.users)).catch(() => {});
      api.get('/reports/recipients').then(({ data }) => setRecipients(data.recipients)).catch(() => {});
    }
  }, [open, isAdmin]);

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwMsg('');
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw });
      setPwMsg('✅ Password updated');
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
      // Refresh list
      const { data } = await api.get('/auth/users');
      setUsers(data.users);
    } catch (err: any) {
      setInviteMsg(`❌ ${err.response?.data?.message || 'Failed to send invite'}`);
    } finally {
      setInviteLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.delete(`/auth/users/${deleteTarget._id || deleteTarget.id}`);
      setUsers((prev) => prev.filter((u) => (u._id || u.id) !== (deleteTarget._id || deleteTarget.id)));
      setDeleteTarget(null);
      setDeleteConfirmEmail('');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to remove user');
    }
  };

  if (!open) return null;

  const myLevel = ROLE_HIERARCHY[user?.role || 'employee'];

  return (
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Panel */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Settings</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Profile */}
        <section className={styles.section}>
          <h3>Profile</h3>
          <div className={styles.profileInfo}>
            <span>{user?.name || user?.email}</span>
            <span className={styles.roleBadge}>{ROLE_LABELS[user?.role || 'employee']}</span>
          </div>
        </section>

        {/* Change password */}
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
              {pwLoading ? 'Updating...' : 'Update'}
            </button>
            {pwMsg && <div className={styles.msg}>{pwMsg}</div>}
          </form>
        </section>

        {/* Admin: Invite user */}
        {isAdmin && (
          <section className={styles.section}>
            <h3>Invite User</h3>
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
        )}

        {/* Admin: User list */}
        {isAdmin && users.length > 0 && (
          <section className={styles.section}>
            <h3>Team ({users.length})</h3>
            <div className={styles.userList}>
              {users.map((u) => {
                const uid = u._id || u.id;
                const canRemove =
                  uid !== (user?._id || user?.id) &&
                  ROLE_HIERARCHY[u.role] < myLevel;
                return (
                  <div key={uid} className={styles.userRow}>
                    <div className={styles.userInfo}>
                      <span className={styles.userName}>{u.name || u.email}</span>
                      <span className={styles.userEmail}>{u.email}</span>
                    </div>
                    <span className={`${styles.roleBadge} ${styles[`role_${u.role}`]}`}>
                      {ROLE_LABELS[u.role]}
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
        )}

        {/* Admin: Report Recipients */}
        {isAdmin && (
          <section className={styles.section}>
            <h3>Report Recipients</h3>
            <p className={styles.recipientHint}>Emails that receive automated daily digests and health alerts.</p>
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
            {recipients.length === 0 && (
              <div className={styles.recipientEmpty}>No recipients configured. Reports won't be emailed.</div>
            )}
          </section>
        )}

        {/* Logout */}
        <section className={styles.section}>
          <button className={styles.logoutBtn} onClick={logout}>
            Sign Out
          </button>
        </section>
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
