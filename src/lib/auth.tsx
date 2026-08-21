import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'azure' | 'github';

/**
 * signIn resolves as soon as the password itself is correct, even for a
 * user enrolled in MFA -- Supabase issues a real session at 'aal1'
 * (password-only) and expects the caller to separately check whether
 * stepping up to 'aal2' (password + TOTP) is required before treating the
 * user as fully signed in. Login.tsx checks this and routes to the MFA
 * challenge screen instead of the app when it's true.
 */
export async function mfaStepUpRequired(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /**
   * Calls Supabase's real OAuth flow -- this redirects to the provider and
   * back, it isn't simulated. It only succeeds end-to-end once the
   * corresponding provider is turned on with real client credentials under
   * Authentication > Providers in the Supabase dashboard; until then,
   * Supabase itself returns a real "provider is not enabled" error rather
   * than this silently pretending to work.
   */
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  /**
   * Calls Supabase's real Enterprise SSO API (SAML 2.0 federation with a
   * customer's own IdP -- Okta/Entra ID/Ping, not the consumer OAuth
   * providers above). Same honest-failure shape as signInWithOAuth: this
   * redirects for real once a provider is registered for the given email
   * domain, and Supabase itself returns a real "no SSO provider found for
   * this domain" error until one is. Registering a domain's provider is a
   * one-time setup step done per enterprise customer (via Supabase's
   * project-level SSO configuration, which itself requires a paid add-on
   * tier) -- this function only calls the login API, it doesn't configure
   * anything.
   */
  signInWithSSO: (domain: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Creates the public.profiles row the first time we see an authenticated
 * user. This is also what triggers handle_new_profile() in
 * 001_init.sql, which converts any pending email invites into real
 * role_grants — so "invite by email" only resolves once this has run at
 * least once for the invited user.
 */
async function ensureProfile(user: User) {
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email, full_name: (user.user_metadata?.full_name as string) ?? null },
    { onConflict: 'id', ignoreDuplicates: true },
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) void ensureProfile(session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void ensureProfile(session.user);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login/reset`,
    });
  }, []);

  const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/overview` },
    });
    if (error) throw error;
    // On success the browser navigates away to the provider immediately --
    // there's no local state to set here, execution doesn't continue.
  }, []);

  const signInWithSSO = useCallback(async (domain: string) => {
    const { data, error } = await supabase.auth.signInWithSSO({
      domain,
      options: { redirectTo: `${window.location.origin}/overview` },
    });
    if (error) throw error;
    // Unlike signInWithOAuth (which always redirects on success),
    // signInWithSSO returns a url to navigate to rather than redirecting
    // itself -- Supabase's own API shape, not a choice made here.
    if (data?.url) window.location.href = data.url;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, signIn, signUp, signOut, resetPassword, signInWithOAuth, signInWithSSO }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
