import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pb } from '../lib/pocketbase';

export function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !code) return;

    if (!user) {
      navigate(`/signup?returnTo=${encodeURIComponent(`/join/${code}`)}`, { replace: true });
      return;
    }

    let cancelled = false;
    pb.send<{ id: string; name: string }>('/api/join', { method: 'POST', body: { code } })
      .then((workspace) => {
        if (!cancelled) navigate(`/w/${workspace.id}`, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setError('קוד ההזמנה לא נמצא, או שאינו תקף יותר. בקשו קישור חדש ממי ששיתף אותו.');
      });
    return () => { cancelled = true; };
  }, [code, user, isLoading, navigate]);

  if (error) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>לא הצלחנו להצטרף</h1>
          <p className="auth-error">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <p>מצטרפים לתסקיר…</p>
    </div>
  );
}
