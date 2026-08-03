import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { pb } from '../lib/pocketbase';
import { generateInviteCode } from '../lib/inviteCode';
import type { Workspace } from '../lib/types';

export function WorkspacesPage() {
  const { user, logOut } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function load() {
    const list = await pb.collection('workspaces').getFullList<Workspace>({ sort: '-created' });
    setWorkspaces(list);
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const workspace = await pb.collection('workspaces').create<Workspace>({
        name: name.trim(),
        owner: user.id,
        invite_code: generateInviteCode(),
      });
      await pb.collection('workspace_members').create({
        workspace: workspace.id,
        user: user.id,
        role: 'owner',
      });
      setName('');
      await load();
    } catch {
      setError('לא הצלחנו לפתוח תסקיר חדש. נסו שוב.');
    } finally {
      setBusy(false);
    }
  }

  async function rotateInvite(workspace: Workspace) {
    const invite_code = generateInviteCode();
    await pb.collection('workspaces').update(workspace.id, { invite_code });
    await load();
  }

  function inviteLink(workspace: Workspace) {
    return `${window.location.origin}/join/${workspace.invite_code}`;
  }

  async function copyInvite(workspace: Workspace) {
    await navigator.clipboard.writeText(inviteLink(workspace));
    setCopiedId(workspace.id);
    setTimeout(() => setCopiedId((id) => (id === workspace.id ? null : id)), 2000);
  }

  return (
    <div className="page">
      <header className="page-head">
        <h1>התסקירים שלי</h1>
        <button className="ghost" onClick={logOut}>יציאה</button>
      </header>

      <form className="card create-workspace" onSubmit={onCreate}>
        <label>
          שם התסקיר החדש
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="למשל: התסקיר של דנה ויובל"
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>{busy ? 'פותח…' : 'פתיחת תסקיר חדש'}</button>
      </form>

      <ul className="workspace-list">
        {workspaces.map((w) => (
          <li key={w.id} className="card workspace-row">
            <Link to={`/w/${w.id}`} className="workspace-name">{w.name}</Link>
            <div className="workspace-actions">
              <button className="ghost" onClick={() => copyInvite(w)}>
                {copiedId === w.id ? 'הועתק ✓' : 'העתקת קישור הזמנה'}
              </button>
              {w.owner === user?.id && (
                <button className="ghost" onClick={() => rotateInvite(w)}>קישור חדש</button>
              )}
            </div>
          </li>
        ))}
        {workspaces.length === 0 && (
          <p className="empty-hint">עדיין אין לך תסקירים — פתחו את הראשון למעלה.</p>
        )}
      </ul>
    </div>
  );
}
