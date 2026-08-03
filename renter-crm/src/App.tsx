import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './auth/AuthContext';
import { SignupPage } from './pages/SignupPage';
import { LoginPage } from './pages/LoginPage';
import { WorkspacesPage } from './pages/WorkspacesPage';
import { WorkspaceHomePage } from './pages/WorkspaceHomePage';
import { JoinPage } from './pages/JoinPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!user) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/workspaces" replace />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/join/:code" element={<JoinPage />} />
      <Route path="/workspaces" element={<RequireAuth><WorkspacesPage /></RequireAuth>} />
      <Route path="/w/:workspaceId" element={<RequireAuth><WorkspaceHomePage /></RequireAuth>} />
    </Routes>
  );
}
