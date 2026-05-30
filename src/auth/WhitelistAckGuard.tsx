import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/auth/AuthProvider";

export const WHITELIST_ACK_KEY = "bimyah_whitelist_ack_pending";

/**
 * If a user signed up but never acknowledged the "Super Important!" overlay,
 * we stored their user id under WHITELIST_ACK_KEY. Whenever that user is
 * signed in and lands anywhere other than /auth, send them back so they can
 * complete the acknowledgement.
 */
export function WhitelistAckGuard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (loading || !user) return;
    let pending: string | null = null;
    try {
      pending = localStorage.getItem(WHITELIST_ACK_KEY);
    } catch {
      /* ignore */
    }
    if (pending && pending === user.id && pathname !== "/auth") {
      void navigate({ to: "/auth" });
    }
  }, [user, loading, pathname, navigate]);

  return null;
}
