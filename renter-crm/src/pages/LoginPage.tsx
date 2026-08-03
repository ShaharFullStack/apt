import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { logIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await logIn(email, password);
      const returnTo = params.get('returnTo');
      navigate(returnTo || '/workspaces', { replace: true });
    } catch {
      setError('אימייל או סיסמה שגויים.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>התחברות</h1>
        <label>
          אימייל
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          סיסמה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'מתחבר…' : 'התחברות'}</button>
        <p className="auth-switch">
          אין לך חשבון? <Link to={`/signup${window.location.search}`}>יצירת חשבון</Link>
        </p>
      </form>
    </div>
  );
}
