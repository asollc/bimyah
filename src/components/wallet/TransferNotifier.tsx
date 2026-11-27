import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "@/auth/AuthProvider";
import { listUnseenTransfers, markTransfersSeen } from "@/lib/rpc/transfers.functions";
import { BimbucksIcon } from "@/components/wallet/CurrencyIcons";

export function TransferNotifier() {
  const { user } = useAuth();
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      shownRef.current.clear();
      return;
    }
    let cancelled = false;

    async function check() {
      try {
        const { rows } = await listUnseenTransfers();
        if (cancelled || rows.length === 0) return;
        const fresh = rows.filter((r) => !shownRef.current.has(r.id));
        if (fresh.length === 0) return;
        for (const r of fresh) {
          shownRef.current.add(r.id);
          toast.success(
            `+${r.amount.toLocaleString()} Bimbucks from ${r.sender_name}`,
            {
              description: r.note ?? undefined,
              icon: <BimbucksIcon size={18} />,
              duration: 8000,
            },
          );
        }
        await markTransfersSeen({ data: { ids: fresh.map((r) => r.id) } });
      } catch {
        /* ignore */
      }
    }

    void check();
    const t = setInterval(() => void check(), 30_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [user]);

  return null;
}
