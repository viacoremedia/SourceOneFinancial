import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import api from '../../../core/services/api';
import styles from './Auth.module.css';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

        <h2 className={styles.title}>Forgot Password</h2>
        <p className={styles.subtitle}>
          {submitted
            ? "We've sent recovery instructions to your inbox."
            : 'Enter your email address and we will send you a link to reset your password.'}
        </p>

        {submitted ? (
          <div>
            <div className={styles.successBox}>
              <div className={styles.successTitle}>
                <CheckCircle2 size={18} />
                <span>Reset link dispatched</span>
              </div>
              <div className={styles.successText}>
                If an account exists for <strong>{email}</strong>, you will receive an email shortly with a link to reset your password. The link expires in 1 hour.
              </div>
            </div>

            <Link to="/login" className={styles.submitBtn} style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>
              Return to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.label}>
              Email address
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoFocus
                required
                id="forgot-email"
              />
            </label>

            {error && <div className={styles.error}>{error}</div>}

            <button className={styles.submitBtn} type="submit" disabled={loading || !email.trim()} id="forgot-submit">
              {loading ? (
                'Sending reset link...'
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Mail size={16} />
                  Send Reset Link
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
