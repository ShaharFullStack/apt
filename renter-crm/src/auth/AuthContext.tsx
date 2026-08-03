import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthRecord } from 'pocketbase';
import { pb } from '../lib/pocketbase';

interface AuthContextValue {
  user: AuthRecord | null;
  isLoading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  logIn: (email: string, password: string) => Promise<void>;
  logOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthRecord | null>(pb.authStore.record);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record);
    });
    setIsLoading(false);
    return unsubscribe;
  }, []);

  async function signUp(email: string, password: string, name: string) {
    await pb.collection('users').create({ email, password, passwordConfirm: password, name });
    await pb.collection('users').authWithPassword(email, password);
  }

  async function logIn(email: string, password: string) {
    await pb.collection('users').authWithPassword(email, password);
  }

  function logOut() {
    pb.authStore.clear();
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signUp, logIn, logOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
