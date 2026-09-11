import { useState, type FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sun, Moon } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../../../core/hooks/useTheme';
import styles from './Auth.module.css';

export function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token') || '';

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!inviteToken) {
    return (
      <div className={styles.authPage}>
        <button
          type="button"
          onClick={toggleTheme}
          className={styles.themeToggle}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle visual theme"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <div className={styles.authCard}>
          <h2 className={styles.title}>Invalid Invite</h2>
          <p className={styles.subtitle}>This invite link is missing or invalid.</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await acceptInvite(inviteToken, password, name);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <button
        type="button"
        onClick={toggleTheme}
        className={styles.themeToggle}
        title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle visual theme"
      >
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className={styles.authCard}>
        <div className={styles.brandRow}>
          <img src="/sourceonelogo.png" alt="Source One Financial Services" className={styles.brandLogo} />
          <div className={styles.brandTag}>Dealer Analytics</div>
        </div>
        <h2 className={styles.title}>Set up your account</h2>
        <p className={styles.subtitle}>Create a password to get started.</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Your Name
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              autoFocus
              id="invite-name"
            />
          </label>
          <label className={styles.label}>
            Password
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              required
              id="invite-password"
            />
          </label>
          <label className={styles.label}>
            Confirm Password
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              required
              id="invite-confirm-password"
            />
          </label>
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.submitBtn} type="submit" disabled={loading} id="invite-submit">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
