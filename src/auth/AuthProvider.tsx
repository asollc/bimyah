import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchProfile(uid: string) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }

  // Install a fetch interceptor that attaches the current Supabase access token
  // to all server-fn calls (so requireSupabaseAuth middleware works).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __serverFnFetchPatched?: boolean };
    if (w.__serverFnFetchPatched) return;
    w.__serverFnFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      try {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : (input as Request).url;
        if (url && url.includes("/_serverFn/")) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (token) {
            const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
            if (!headers.has("authorization")) {
              headers.set("authorization", `Bearer ${token}`);
            }
            return originalFetch(input, { ...init, headers });
          }
        }
      } catch {
        /* fall through to default fetch */
      }
      return originalFetch(input, init);
    };
  }, []);

  useEffect(() => {
    // CRITICAL: subscribe before fetching session.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        // Defer to avoid deadlocks per Supabase guidance.
        setTimeout(() => {
          void fetchProfile(newSession.user.id);
        }, 0);
      } else {
        setProfile(null);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        void fetchProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
