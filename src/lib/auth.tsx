import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

/**
 * Email/password auth against horizonvigil-admin's /api/auth/* endpoints.
 * The session token is a Supabase-JWT-shaped HS256 token minted by the admin
 * service; it's stored in localStorage and sent as the bearer on every API
 * call (see lib/api.ts). No Supabase Auth SDK, no MFA, no OAuth/SSO.
 */

const AUTH_BASE = `${import.meta.env.VITE_USERS_API_URL || ''}/api/auth`;
const TOKEN_KEY = 'hv_auth_token';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode / storage disabled — session just won't persist */
  }
}

/** Decodes a JWT payload without verifying — server verifies on every request. */
function decodeJwt(token: string): { sub?: string; email?: string; exp?: number } | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=')));
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = decodeJwt(token)?.exp;
  return typeof exp === 'number' && exp * 1000 < Date.now();
}

async function authFetch(path: string, body: unknown, token?: string): Promise<unknown> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: unknown; error?: string } | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error || 'Request failed');
  return json.data;
}

interface LoginResult { token: string; user: AuthUser }

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token || isExpired(token)) {
      setToken(null);
      setIsLoading(false);
      return;
    }
    const claims = decodeJwt(token);
    // Optimistic: trust the local claims for id/email, fill fullName from /me.
    setUser({ id: claims?.sub ?? '', email: claims?.email ?? '', fullName: null });

    (async () => {
      try {
        const me = (await (await fetch(`${AUTH_BASE}/me`, { headers: { Authorization: `Bearer ${token}` } })).json()) as { ok?: boolean; data?: AuthUser };
        if (me?.ok && me.data) setUser(me.data);
        // Silently extend a session with <2 days left.
        const exp = claims?.exp ?? 0;
        if (exp * 1000 - Date.now() < 2 * 24 * 60 * 60 * 1000) {
          const refreshed = (await authFetch('/refresh', {}, token)) as { token: string };
          setToken(refreshed.token);
        }
      } catch {
        // /me failed (revoked, network) — drop the session.
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { token, user } = (await authFetch('/login', { email, password })) as LoginResult;
    setToken(token);
    setUser(user);
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const { token, user } = (await authFetch('/signup', { email, password, fullName })) as LoginResult;
    setToken(token);
    setUser(user);
  }, []);

  const signOut = useCallback(async () => {
    setToken(null);
    setUser(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    await authFetch('/forgot-password', { email });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, signIn, signUp, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
