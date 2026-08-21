import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import api from '../../../core/services/api';
import styles from './Auth.module.css';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const resetToken = searchParams.get('token') || '';

  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Validate token on mount
  useEffect(() => {
    if (!resetToken) {
      setVerifying(false);
      setTokenValid(false);
      setTokenError('Password reset link is missing or invalid.');
      return;
    }

    api.get(`/auth/verify-reset-token?token=${encodeURIComponent(resetToken)}`)
      .then(({ data }) => {
        setTokenValid(true);
        if (data.email) setUserEmail(data.email);
      })
      .catch((err) => {
        setTokenValid(false);
        setTokenError(err.response?.data?.message || 'Password reset link has expired or is invalid.');
      })
      .finally(() => {
        setVerifying(false);
      });
  }, [resetToken]);

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
      const { data } = await api.post('/auth/reset-password', {
        token: resetToken,
        password,
      });

      if (data.token && data.user) {
        localStorage.setItem('sourceone_token', data.token);
        localStorage.setItem('sourceone_user', JSON.stringify(data.user));
        setUser(data.user);
      }

      setSuccess(true);
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authCard}>
          <div className={styles.brandRow}>
            <div className={styles.brandMark}>S1</div>
            <div>
              <div className={styles.brandName}>Source One</div>
              <div className={styles.brandTag}>Dealer Analytics</div>
            </div>
          </div>
          <h2 className={styles.title}>Verifying link...</h2>
          <p className={styles.subtitle}>Please wait while we validate your reset token.</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className={styles.authPage}>
        <div className={styles.authCard}>
          <div className={styles.brandRow}>
            <div className={styles.brandMark}>S1</div>
            <div>
              <div className={styles.brandName}>Source One</div>
              <div className={styles.brandTag}>Dealer Analytics</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444', marginBottom: 12 }}>
            <AlertCircle size={24} />
            <h2 className={styles.title} style={{ margin: 0 }}>Link Expired or Invalid</h2>
          </div>

          <p className={styles.subtitle}>
            {tokenError || 'This password reset link is invalid or has expired. Reset links are valid for 1 hour.'}
          </p>

          <Link to="/forgot-password" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
            Request New Reset Link
          </Link>

          <div className={styles.backLinkRow}>
            <Link to="/login" className={styles.backLink}>
              <ArrowLeft size={15} />
              Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.brandRow}>
          <div className={styles.brandMark}>S1</div>
          <div>
            <div className={styles.brandName}>Source One</div>
            <div className={styles.brandTag}>Dealer Analytics</div>
          </div>
        </div>

        <h2 className={styles.title}>Create new password</h2>
        <p className={styles.subtitle}>
          {userEmail ? `Choose a secure password for ${userEmail}.` : 'Enter a new password for your account.'}
        </p>

        {success ? (
          <div className={styles.successBox}>
            <div className={styles.successTitle}>
              <CheckCircle2 size={18} />
              <span>Password reset successfully</span>
            </div>
            <div className={styles.successText}>
              Your password has been updated. Redirecting you to the dashboard...
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              New Password
              <div className={styles.inputWrapper}>
                <input
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoFocus
                  required
                  id="reset-password"
                />
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            <label className={styles.label}>
              Confirm New Password
              <div className={styles.inputWrapper}>
                <input
                  className={styles.input}
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  required
                  id="reset-confirm-password"
                />
                <button
                  type="button"
                  className={styles.toggleBtn}
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.submitBtn} type="submit" disabled={loading} id="reset-submit">
              {loading ? (
                'Updating password...'
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <KeyRound size={16} />
                  Reset Password & Sign In
                </span>
              )}
            </button>
          </form>
        )}

        <div className={styles.backLinkRow}>
          <Link to="/login" className={styles.backLink}>
            <ArrowLeft size={15} />
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
