import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import {
  getMyAdminStatus,
  getAdminOverview,
  listSubscriptions,
  grantBplus,
  revokeBplus,
  listUsers,
  setAdminRole,
  setFoundingMember,
  getAdminBplusConfig,
  updateBplusConfig,
  getShareStats,
} from "@/server/admin.functions";
import { listRandomGifts, allocateRandomGift } from "@/server/gifts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ShieldCheck, ShieldOff, Crown, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Bimyah!" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPage,
});

function fmtCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

function AdminPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    void getMyAdminStatus()
      .then((r) => setIsAdmin(r.is_admin))
      .finally(() => setChecking(false));
  }, [user, loading, navigate]);

  if (loading || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <ShieldOff className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">Forbidden</h1>
        <p className="text-muted-foreground text-sm">You don't have admin access.</p>
        <Link to="/" className="text-sm underline">Go home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Bimyah! Admin</h1>
          </div>
          <Link to="/" className="text-sm text-muted-foreground hover:underline">
            Back to app
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-6 max-w-3xl">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subs">Subscriptions</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="gifts">Gifts</TabsTrigger>
            <TabsTrigger value="shares">Shares</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="subs" className="mt-6">
            <SubscriptionsTab />
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            <UsersTab />
          </TabsContent>
          <TabsContent value="gifts" className="mt-6">
            <GiftsTab />
          </TabsContent>
          <TabsContent value="shares" className="mt-6">
            <SharesTab />
          </TabsContent>
          <TabsContent value="config" className="mt-6">
            <ConfigTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------- Overview ----------
type Overview = Awaited<ReturnType<typeof getAdminOverview>>;
function OverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void getAdminOverview()
      .then(setData)
      .catch((e) => toast.error(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, []);
  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!data) return null;
  const stats: { label: string; value: string }[] = [
    { label: "Total users", value: String(data.total_users) },
    { label: "Active Bimyah!+", value: String(data.active_subs) },
    { label: "Founding members", value: String(data.founding_members) },
    { label: "Lifetime sold", value: `${data.lifetime_sold} / ${data.lifetime_quota}` },
    { label: "Lifetime remaining", value: String(data.lifetime_remaining) },
    { label: "Revenue (30d)", value: fmtCents(data.revenue_cents_30d) },
    { label: "Payments (30d)", value: String(data.payments_30d) },
    { label: "Games (lobby / total)", value: `${data.games_in_lobby} / ${data.games_total}` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
          <div className="mt-1 text-2xl font-semibold">{s.value}</div>
        </Card>
      ))}
    </div>
  );
}

// ---------- Subscriptions ----------
type SubRow = Awaited<ReturnType<typeof listSubscriptions>>["rows"][number];
function SubscriptionsTab() {
  const [rows, setRows] = useState<SubRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [loading, setLoading] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listSubscriptions({
        data: { search: search || undefined, status: status as never, limit: 100 },
      });
      setRows(res.rows);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this subscription?")) return;
    try {
      await revokeBplus({ data: { subscription_id: id } });
      toast.success("Revoked");
      await refresh();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name or user id"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void refresh()}
          className="max-w-xs"
        />
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
        <div className="flex-1" />
        <Button onClick={() => setGrantOpen((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Grant Bimyah!+
        </Button>
      </div>

      {grantOpen && (
        <GrantBplusForm
          onDone={async () => {
            setGrantOpen(false);
            await refresh();
          }}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Status</th>
              <th className="p-2">Source</th>
              <th className="p-2">Period end</th>
              <th className="p-2">Created</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">
                  <div className="font-medium">{r.display_name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.user_id.slice(0, 8)}…</div>
                </td>
                <td className="p-2">{r.plan}</td>
                <td className="p-2">
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                </td>
                <td className="p-2 text-xs">{r.source}</td>
                <td className="p-2 text-xs">{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString() : "—"}</td>
                <td className="p-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                <td className="p-2 text-right">
                  {r.status === "active" && (
                    <Button size="sm" variant="ghost" onClick={() => void handleRevoke(r.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && !loading && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">No subscriptions</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function GrantBplusForm({ onDone }: { onDone: () => void | Promise<void> }) {
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState<"lifetime" | "monthly" | "annual">("lifetime");
  const [busy, setBusy] = useState(false);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-64">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">User ID (uuid)</label>
          <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-..." />
        </div>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">Plan</label>
          <Select value={plan} onValueChange={(v) => setPlan(v as typeof plan)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="lifetime">Lifetime</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          disabled={busy || !userId}
          onClick={async () => {
            setBusy(true);
            try {
              await grantBplus({ data: { user_id: userId, plan } });
              toast.success("Granted");
              setUserId("");
              await onDone();
            } catch (e: unknown) {
              toast.error(String((e as Error)?.message ?? e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Grant"}
        </Button>
      </div>
    </Card>
  );
}

// ---------- Users ----------
type UserRow = Awaited<ReturnType<typeof listUsers>>["rows"][number];
function UsersTab() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listUsers({ data: { search: search || undefined, limit: 100 } });
      setRows(res.rows);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleAdmin(u: UserRow) {
    const isAdmin = u.roles.includes("admin");
    if (!confirm(isAdmin ? `Demote ${u.display_name} from admin?` : `Promote ${u.display_name} to admin?`)) return;
    try {
      await setAdminRole({ data: { user_id: u.id, make_admin: !isAdmin } });
      toast.success(isAdmin ? "Demoted" : "Promoted");
      await refresh();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    }
  }
  async function toggleFounder(u: UserRow) {
    try {
      await setFoundingMember({ data: { user_id: u.id, grant: !u.founding_member } });
      toast.success(u.founding_member ? "Removed founding badge" : "Granted founding badge");
      await refresh();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    }
  }

  async function handleGrantBplus(u: UserRow) {
    if (u.active_plan) {
      if (!confirm(`Revoke Bimyah!+ from ${u.display_name}?`)) return;
      try {
        // Find their active sub
        const { rows } = await listSubscriptions({
          data: { search: u.id, status: "active", limit: 5 },
        });
        const sub = rows.find((r) => r.user_id === u.id);
        if (!sub) throw new Error("No active subscription found");
        await revokeBplus({ data: { subscription_id: sub.id } });
        toast.success("Revoked Bimyah!+");
        await refresh();
      } catch (e: unknown) {
        toast.error(String((e as Error)?.message ?? e));
      }
      return;
    }
    const planInput = prompt(`Grant Bimyah!+ to ${u.display_name}.\nEnter plan: lifetime, monthly, or annual`, "lifetime");
    if (!planInput) return;
    const plan = planInput.trim().toLowerCase();
    if (!["lifetime", "monthly", "annual"].includes(plan)) {
      toast.error("Invalid plan");
      return;
    }
    try {
      await grantBplus({ data: { user_id: u.id, plan: plan as "lifetime" | "monthly" | "annual" } });
      toast.success("Granted Bimyah!+");
      await refresh();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by display name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void refresh()}
          className="max-w-xs"
        />
        <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">User</th>
              <th className="p-2">Roles</th>
              <th className="p-2">Bimyah!+</th>
              <th className="p-2">Joined</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const isAdmin = u.roles.includes("admin");
              const isMe = me?.id === u.id;
              return (
                <tr key={u.id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium flex items-center gap-1">
                      {u.display_name}
                      {u.founding_member && <Crown className="h-3 w-3 text-amber-500" />}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[220px]">
                      {u.email ?? <span className="font-mono">{u.id.slice(0, 8)}…</span>}
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {u.roles.map((r) => (
                        <Badge key={r} variant={r === "admin" ? "default" : "outline"}>{r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 text-xs">{u.active_plan ?? "—"}</td>
                  <td className="p-2 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isMe && isAdmin}
                        onClick={() => void toggleAdmin(u)}
                      >
                        {isAdmin ? "Demote" : "Make admin"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void toggleFounder(u)}>
                        <Crown className={`h-4 w-4 ${u.founding_member ? "text-amber-500" : "text-muted-foreground"}`} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length && !loading && (
              <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">No users</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------- Config ----------
function ConfigTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lifetime_quota: 0,
    lifetime_price_cents: 0,
    monthly_price_cents: 0,
    annual_price_cents: 0,
  });
  const [meta, setMeta] = useState<{ lifetime_sold: number; updated_at: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const cfg = await getAdminBplusConfig();
      setForm({
        lifetime_quota: cfg.lifetime_quota,
        lifetime_price_cents: cfg.lifetime_price_cents,
        monthly_price_cents: cfg.monthly_price_cents,
        annual_price_cents: cfg.annual_price_cents,
      });
      setMeta({ lifetime_sold: cfg.lifetime_sold, updated_at: cfg.updated_at });
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <Card className="max-w-xl p-6 space-y-4">
      <h2 className="text-lg font-semibold">Bimyah!+ pricing & quota</h2>
      <p className="text-sm text-muted-foreground">
        Lifetime sold: <span className="font-medium">{meta?.lifetime_sold ?? 0}</span>
        {meta?.updated_at && (
          <> · Updated {new Date(meta.updated_at).toLocaleString()}</>
        )}
      </p>

      <Field label="Lifetime quota (slots)" type="int" value={form.lifetime_quota}
        onChange={(v) => setForm({ ...form, lifetime_quota: v })} />
      <Field label="Lifetime price" type="cents" value={form.lifetime_price_cents}
        onChange={(v) => setForm({ ...form, lifetime_price_cents: v })} />
      <Field label="Monthly price" type="cents" value={form.monthly_price_cents}
        onChange={(v) => setForm({ ...form, monthly_price_cents: v })} />
      <Field label="Annual price" type="cents" value={form.annual_price_cents}
        onChange={(v) => setForm({ ...form, annual_price_cents: v })} />

      <Button
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await updateBplusConfig({ data: form });
            toast.success("Saved");
            await refresh();
          } catch (e: unknown) {
            toast.error(String((e as Error)?.message ?? e));
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
      </Button>
    </Card>
  );
}

function Field({
  label, value, onChange, type,
}: {
  label: string; value: number; onChange: (v: number) => void; type: "int" | "cents";
}) {
  const display = type === "cents" ? (value / 100).toFixed(2) : String(value);
  return (
    <div>
      <label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} {type === "cents" && <span className="normal-case">(USD)</span>}
      </label>
      <Input
        type="number"
        step={type === "cents" ? "0.01" : "1"}
        min="0"
        value={display}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isNaN(n)) return onChange(0);
          onChange(type === "cents" ? Math.round(n * 100) : Math.round(n));
        }}
      />
    </div>
  );
}

// ---------- Shares ----------
type ShareStats = Awaited<ReturnType<typeof getShareStats>>;
function SharesTab() {
  const [data, setData] = useState<ShareStats | null>(null);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    setLoading(true);
    try {
      const res = await getShareStats();
      setData(res);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  if (loading && !data) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (!data) return null;
  const stats = [
    { label: "Total shares", value: String(data.total) },
    { label: "Last 30 days", value: String(data.last_30d) },
    { label: "Last 7 days", value: String(data.last_7d) },
    { label: "Native share (30d)", value: String(data.web_share_30d) },
    { label: "Copied link (30d)", value: String(data.clipboard_30d) },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Share activity
        </h2>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
            <div className="mt-1 text-2xl font-semibold">{s.value}</div>
          </Card>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">When</th>
              <th className="p-2">User</th>
              <th className="p-2">Method</th>
              <th className="p-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">
                  <div className="font-medium">{r.display_name}</div>
                  {r.user_id && (
                    <div className="text-xs text-muted-foreground font-mono">
                      {r.user_id.slice(0, 8)}…
                    </div>
                  )}
                </td>
                <td className="p-2">
                  <Badge variant={r.method === "web_share" ? "default" : "secondary"}>
                    {r.method === "web_share" ? "Native share" : "Copied link"}
                  </Badge>
                </td>
                <td className="p-2 text-xs">{r.source}</td>
              </tr>
            ))}
            {data.recent.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-sm text-muted-foreground">
                  No shares yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------- Gifts (random gift purchasers) ----------
type GiftPurchasers = Awaited<ReturnType<typeof listRandomGifts>>["purchasers"];

function GiftsTab() {
  const [purchasers, setPurchasers] = useState<GiftPurchasers>([]);
  const [loading, setLoading] = useState(true);
  const [allocating, setAllocating] = useState<string | null>(null);
  const [recipientByGift, setRecipientByGift] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await listRandomGifts();
      setPurchasers(res.purchasers);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function handleAllocate(giftId: string) {
    const recipientId = (recipientByGift[giftId] ?? "").trim();
    if (!recipientId) {
      toast.error("Enter a recipient user ID");
      return;
    }
    setAllocating(giftId);
    try {
      await allocateRandomGift({ data: { gift_id: giftId, recipient_user_id: recipientId } });
      toast.success("Gift allocated");
      setRecipientByGift((m) => ({ ...m, [giftId]: "" }));
      await refresh();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message ?? e));
    } finally {
      setAllocating(null);
    }
  }

  if (loading && !purchasers.length) return <Loader2 className="h-5 w-5 animate-spin" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Random gift purchasers
        </h2>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="p-2">Purchaser</th>
              <th className="p-2">Email</th>
              <th className="p-2">Total</th>
              <th className="p-2">Pending</th>
              <th className="p-2">Allocated</th>
              <th className="p-2">Spent</th>
              <th className="p-2">Last purchase</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {purchasers.map((p) => (
              <>
                <tr key={p.purchaser_id} className="border-t">
                  <td className="p-2">
                    <div className="font-medium">{p.display_name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {p.purchaser_id.slice(0, 8)}…
                    </div>
                  </td>
                  <td className="p-2 text-xs">{p.email ?? "—"}</td>
                  <td className="p-2 font-medium">{p.total_purchased}</td>
                  <td className="p-2">
                    <Badge variant={p.pending > 0 ? "default" : "secondary"}>{p.pending}</Badge>
                  </td>
                  <td className="p-2">{p.fulfilled}</td>
                  <td className="p-2 text-xs">{fmtCents(p.total_amount_cents)}</td>
                  <td className="p-2 text-xs">{new Date(p.last_purchase_at).toLocaleDateString()}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setExpanded(expanded === p.purchaser_id ? null : p.purchaser_id)
                      }
                    >
                      {expanded === p.purchaser_id ? "Hide" : "Manage"}
                    </Button>
                  </td>
                </tr>
                {expanded === p.purchaser_id && (
                  <tr className="border-t bg-muted/20">
                    <td colSpan={8} className="p-3">
                      <div className="space-y-2">
                        {p.gifts.map((g) => (
                          <div
                            key={g.id}
                            className="flex flex-wrap items-center gap-2 rounded-md border bg-background p-2 text-xs"
                          >
                            <Badge variant={g.status === "pending" ? "default" : "secondary"}>
                              {g.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              Gift {g.id.slice(0, 8)}… · {fmtCents(g.amount_cents)} ·{" "}
                              {new Date(g.created_at).toLocaleString()}
                            </span>
                            {g.status === "fulfilled" && g.recipient_display_name && (
                              <span className="ml-auto text-muted-foreground">
                                → {g.recipient_display_name}
                              </span>
                            )}
                            {g.status === "pending" && (
                              <div className="ml-auto flex items-center gap-2">
                                <Input
                                  placeholder="Recipient user UUID"
                                  value={recipientByGift[g.id] ?? ""}
                                  onChange={(e) =>
                                    setRecipientByGift((m) => ({ ...m, [g.id]: e.target.value }))
                                  }
                                  className="h-8 w-72 text-xs"
                                />
                                <Button
                                  size="sm"
                                  disabled={allocating === g.id}
                                  onClick={() => void handleAllocate(g.id)}
                                >
                                  {allocating === g.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Allocate"
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {!purchasers.length && !loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-sm text-muted-foreground">
                  No random gifts purchased yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
