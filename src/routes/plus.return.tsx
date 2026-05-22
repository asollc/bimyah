import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BplusIcon } from "@/components/BplusIcon";

export const Route = createFileRoute("/plus/return")({
  head: () => ({
    meta: [
      { title: "Bimyah!+ — Payment complete" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlusReturn,
});

function PlusReturn() {
  useEffect(() => {
    void supabase.auth.refreshSession();
  }, []);

  return (
    <div className="flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-center px-4 py-6">
      <div className="w-full max-w-md rounded-2xl border border-[var(--gold)]/40 bg-black/50 p-6 text-center backdrop-blur">
        <div className="font-display flex items-center justify-center gap-2 text-2xl font-black text-[var(--gold)]">
          <BplusIcon size={32} />
          <span>Welcome to Bimyah!+</span>
        </div>
        <div className="mt-2 text-sm text-white/70">
          Your payment is being processed. Your access will activate within a few seconds.
        </div>
        <Link to="/plus" className="btn-3d btn-3d-gold mt-5 inline-block text-xs">
          View my membership
        </Link>
        <div className="mt-3">
          <Link to="/" className="text-xs text-white/60 hover:text-white">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
