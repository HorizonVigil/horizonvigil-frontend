import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type OAuthProvider = 'google' | 'azure' | 'github';

const PROFILE_TABLE = 'profiles';
const PROFILE_ID_FIELD = 'id';
const RESET_PATH = '/login/reset';
const AUTHENTICATED_REDIRECT_PATH = '/overview';

/**
 * Supabase can issue an AAL1 session after password authentication even when
 * the account requires MFA. Callers should check this before granting access
 * to the authenticated application surface.
 */
export async function mfaStepUpRequired(): Promise<boolean> {
  const {
    data,
    error,
  } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (error) throw error;

  return (
    data.nextLevel === 'aal2' &&
    data.currentLevel !== data.nextLevel
  );
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signInWithSSO: (domain: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeFullName(fullName: string): string {
  return fullName.trim();
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function getBrowserOrigin(): string {
  if (typeof window === 'undefined') {
    throw new Error('Authentication redirect requires a browser environment.');
  }

  return window.location.origin;
}

function authRedirect(path: string): string {
  return `${getBrowserOrigin()}${path}`;
}

/**
 * Ensure the application profile exists for an authenticated user.
 *
 * Profile creation is best-effort from the auth-provider event pipeline. The
 * authenticated session itself must not be invalidated because a profile
 * write is temporarily unavailable; application routes that require a
 * profile can enforce their own readiness check.
 *
 * We intentionally do not log the user object or database error here because
 * those values may contain identity information.
 */
async function ensureProfile(user: User): Promise<void> {
  const email = user.email?.trim() || null;
  const metadataFullName = user.user_metadata?.full_name;

  const fullName =
    typeof metadataFullName === 'string'
      ? metadataFullName.trim() || null
      : null;

  const { error } = await supabase
    .from(PROFILE_TABLE)
    .upsert(
      {
        [PROFILE_ID_FIELD]: user.id,
        email,
        full_name: fullName,
      },
      {
        onConflict: PROFILE_ID_FIELD,
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw error;
  }
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Prevent stale async profile work from surfacing after an unmount.
   * Supabase owns the underlying auth listener lifecycle; this flag only
   * guards React state updates.
   */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    let disposed = false;

    const initialize = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) throw error;

        if (!disposed && mountedRef.current) {
          setUser(session?.user ?? null);
        }

        if (session?.user) {
          void ensureProfile(session.user).catch(() => {
            // Profile provisioning is intentionally non-fatal to auth session
            // restoration. The database/auth layer remains authoritative.
          });
        }
      } catch {
        if (!disposed && mountedRef.current) {
          setUser(null);
        }
      } finally {
        if (!disposed && mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (disposed || !mountedRef.current) return;

      setUser(session?.user ?? null);

      if (session?.user) {
        void ensureProfile(session.user).catch(() => {
          // Best-effort profile provisioning.
        });
      }
    });

    return () => {
      disposed = true;
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail) {
        throw new Error('Email is required.');
      }

      if (!password) {
        throw new Error('Password is required.');
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;
    },
    [],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string,
    ): Promise<void> => {
      const normalizedEmail = normalizeEmail(email);
      const normalizedFullName = normalizeFullName(fullName);

      if (!normalizedEmail) {
        throw new Error('Email is required.');
      }

      if (!password) {
        throw new Error('Password is required.');
      }

      if (!normalizedFullName) {
        throw new Error('Full name is required.');
      }

      const { error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedFullName,
          },
        },
      });

      if (error) throw error;
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    if (mountedRef.current) {
      setUser(null);
    }
  }, []);

  const resetPassword = useCallback(
    async (email: string): Promise<void> => {
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedEmail) {
        throw new Error('Email is required.');
      }

      const { error } =
        await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: authRedirect(RESET_PATH),
        });

      if (error) throw error;
    },
    [],
  );

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<void> => {
      if (!['google', 'azure', 'github'].includes(provider)) {
        throw new Error('Unsupported authentication provider.');
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: authRedirect(AUTHENTICATED_REDIRECT_PATH),
        },
      });

      if (error) throw error;

      // Supabase handles the successful OAuth redirect. No local auth state
      // is manufactured here; on the return trip the auth listener updates it.
    },
    [],
  );

  const signInWithSSO = useCallback(
    async (domain: string): Promise<void> => {
      const normalizedDomain = normalizeDomain(domain);

      if (!normalizedDomain) {
        throw new Error('SSO domain is required.');
      }

      const { data, error } = await supabase.auth.signInWithSSO({
        domain: normalizedDomain,
        options: {
          redirectTo: authRedirect(AUTHENTICATED_REDIRECT_PATH),
        },
      });

      if (error) throw error;

      /**
       * SSO returns a URL for the browser to navigate to. OAuth above uses
       * Supabase's own redirect behavior; do not mix the two flows.
       */
      if (data?.url) {
        window.location.assign(data.url);
      }
    },
    [],
  );

  const value: AuthContextType = {
    user,
    isAuthenticated: user !== null,
    isLoading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    signInWithOAuth,
    signInWithSSO,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
