// Supabase client for the Bimyah app.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Session storage that survives embedded webviews (Ronya 2026-11-04:
// sign-in failed inside the Yapin' activity). The default supabase-js
// storage is raw localStorage, which embedded third-party webviews can
// block outright (access throws) or silently drop, so a successful
// sign-in never sticks and the player bounces back to signed-out. This
// adapter probes localStorage once and falls back to in-memory storage
// when it is unusable: sign-in then works for the life of the webview
// session even where persistence is blocked. In a normal browser (and
// in partitioned-but-working iframe storage) localStorage is used as
// before, so sessions still persist across visits.
const memoryStore = new Map<string, string>();
let localStorageUsable: boolean | null = null;
function probeLocalStorage(): boolean {
  if (localStorageUsable !== null) return localStorageUsable;
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      localStorageUsable = false;
      return false;
    }
    const probeKey = '__bimyah_storage_probe__';
    window.localStorage.setItem(probeKey, '1');
    window.localStorage.removeItem(probeKey);
    localStorageUsable = true;
  } catch {
    localStorageUsable = false;
  }
  return localStorageUsable;
}
// Embedded webviews can also hang the auth client's cross-context lock
// (Ronya 2026-11-04, second report): in the Yapin' activity the sign-in
// button did nothing at all, no error, because supabase-js by default
// serializes auth operations through the browser LockManager
// (navigator.locks), and in embedded/framed webviews that lock request
// can never settle, so signInWithPassword never fires its request.
// His guest name surviving proved local storage itself works there.
// Fix: when the app is running framed (an activity or any iframe), use
// a no-op lock so auth calls proceed directly; top-level browsing keeps
// the default LockManager, so normal multi-tab behavior is unchanged.
function isFramed(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}
const noopLock = async <T>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<T>,
): Promise<T> => {
  return await fn();
};

const authStorage = {
  getItem: (key: string): string | null => {
    if (probeLocalStorage()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        /* fall through to memory */
      }
    }
    return memoryStore.get(key) ?? null;
  },
  setItem: (key: string, value: string): void => {
    if (probeLocalStorage()) {
      try {
        window.localStorage.setItem(key, value);
        return;
      } catch {
        /* fall through to memory */
      }
    }
    memoryStore.set(key, value);
  },
  removeItem: (key: string): void => {
    if (probeLocalStorage()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    memoryStore.delete(key);
  },
};

function createSupabaseClient() {
  // Use import.meta.env for client-side (Vite build-time replacement)
  // Fall back to process.env for SSR (server-side rendering)
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      'Missing Supabase environment variables. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or VITE_ prefixed versions) are set in your .env file.'
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: authStorage,
      ...(isFramed() ? { lock: noopLock } : {}),
    }
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

