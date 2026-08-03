import { useState, type FormEvent } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function SignupPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signUp(email, password, name);
      const returnTo = params.get('returnTo');
      navigate(returnTo || '/workspaces', { replace: true });
    } catch {
      setError('לא הצלחנו ליצור חשבון. ייתכן שהמייל כבר רשום, או שהסיסמה קצרה מדי (8 תווים לפחות).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>יצירת חשבון</h1>
        <label>
          שם
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          אימייל
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          סיסמה
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'יוצר חשבון…' : 'יצירת חשבון'}</button>
        <p className="auth-switch">
          כבר יש לך חשבון? <Link to={`/login${window.location.search}`}>התחברות</Link>
        </p>
      </form>
    </div>
  );
}
