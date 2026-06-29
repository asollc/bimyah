import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { recordReferralVisit } from "@/lib/rpc/admin.functions";

export const Route = createFileRoute("/$username")({
  component: ReferralLandingPage,
});

function ReferralLandingPage() {
  const { username } = Route.useParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("bimyah_referrer", username);
          } catch {
            /* ignore */
          }
        }
        await recordReferralVisit({ data: { username } });
      } catch {
        /* ignore */
      } finally {
        void navigate({ to: "/", replace: true });
      }
    })();
  }, [username, navigate]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center text-white/60">
      Loading…
    </div>
  );
}
