import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { pb } from '../lib/pocketbase';
import type { Workspace, WorkspaceMember } from '../lib/types';

// M0 scope: prove the multi-user real-time foundation works — a member who
// joins from a second browser/session appears here live, with no refresh.
// The actual property list (M1+) replaces this placeholder.
export function WorkspaceHomePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);

  useEffect(() => {
    if (!workspaceId) return;

    let unsubscribe: (() => void) | undefined;

    async function load() {
      const ws = await pb.collection('workspaces').getOne<Workspace>(workspaceId!);
      setWorkspace(ws);
      const memberList = await pb.collection('workspace_members').getFullList<WorkspaceMember>({
        filter: `workspace = "${workspaceId}"`,
        expand: 'user',
        sort: 'created',
      });
      setMembers(memberList);

      unsubscribe = await pb.collection('workspace_members').subscribe<WorkspaceMember>(
        '*',
        async (e) => {
          if (e.record.workspace !== workspaceId) return;
          if (e.action === 'delete') {
            setMembers((prev) => prev.filter((m) => m.id !== e.record.id));
            return;
          }
          // Realtime events don't carry `expand` — re-fetch this one record
          // with the user expanded so a newly-joined member's name shows up
          // immediately instead of just their bare id.
          const withUser = await pb.collection('workspace_members').getOne<WorkspaceMember>(
            e.record.id,
            { expand: 'user' }
          );
          setMembers((prev) => {
            const rest = prev.filter((m) => m.id !== withUser.id);
            return [...rest, withUser];
          });
        }
      );
    }

    load();
    return () => { unsubscribe?.(); };
  }, [workspaceId]);

  if (!workspace) return <div className="page">טוען…</div>;

  return (
    <div className="page">
      <header className="page-head">
        <Link to="/workspaces" className="ghost">← כל התסקירים</Link>
        <h1>{workspace.name}</h1>
      </header>

      <section className="card">
        <h2>חברי הקבוצה ({members.length})</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.id}>
              {m.expand?.user?.name || m.expand?.user?.email || 'משתמש/ת'}
              {m.role === 'owner' && <span className="role-tag">בעל/ת התסקיר</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card empty-hint">
        <p>רשימת הדירות (M1) עוד לא נבנתה — זה כרגע רק מוודא שה-workspace, ההזמנות, וה-realtime עובדים מקצה לקצה.</p>
      </section>
    </div>
  );
}
