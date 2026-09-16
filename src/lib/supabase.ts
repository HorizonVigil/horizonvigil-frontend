import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function requireConfig(
  value: unknown,
  name: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `${name} is not configured. Set the required Vite environment variable before starting the application.`,
    );
  }

  return value.trim();
}

function validateSupabaseUrl(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'VITE_SUPABASE_URL must be a valid absolute URL.',
    );
  }

  if (url.protocol !== 'https:') {
    throw new Error(
      'VITE_SUPABASE_URL must use HTTPS in a production browser build.',
    );
  }

  if (!url.hostname) {
    throw new Error(
      'VITE_SUPABASE_URL must contain a valid hostname.',
    );
  }

  return url.toString().replace(/\/$/, '');
}

const supabaseUrl = validateSupabaseUrl(
  requireConfig(SUPABASE_URL, 'VITE_SUPABASE_URL'),
);

const supabaseAnonKey = requireConfig(
  SUPABASE_PUBLISHABLE_KEY,
  'VITE_SUPABASE_PUBLISHABLE_KEY',
);

/**
 * Browser-side Supabase client.
 *
 * The publishable/anon key is intentionally safe to ship to the browser
 * because Supabase authorization must be enforced by Row Level Security,
 * storage policies, Edge Functions, and backend/API authorization.
 *
 * Never place a service-role key in VITE_* variables or browser code.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'horizonvigil-auth',
    },
    global: {
      headers: {
        'X-Client-Info': 'horizonvigil-web',
      },
    },
  },
);
