import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  /** true quando o usuário abriu o link de recuperação de senha */
  recoveringPassword: boolean;
  setRecoveringPassword: (v: boolean) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (fullName: string, email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** URL de retorno dos e-mails (confirmação e recuperação). Deve estar em "Redirect URLs" no Supabase. */
export function authRedirectUrl(next?: string): string {
  return Linking.createURL('/auth/callback', next ? { queryParams: { next } } : undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setInitializing(false));

    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      recoveringPassword,
      setRecoveringPassword,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      },
      async signUp(fullName, email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: authRedirectUrl() },
        });
        if (error) throw error;
        return { needsConfirmation: !data.session };
      },
      async sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: authRedirectUrl('/reset-password'),
        });
        if (error) throw error;
      },
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecoveringPassword(false);
      },
      async resendConfirmation(email) {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: email.trim(),
          options: { emailRedirectTo: authRedirectUrl() },
        });
        if (error) throw error;
      },
      async signOut() {
        await supabase.auth.signOut();
        queryClient.clear();
      },
    }),
    [session, initializing, recoveringPassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
