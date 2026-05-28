import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ONLINE_WINDOW_SECONDS = 90;

export type FriendUser = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  online: boolean;
};

export type FriendshipRow = {
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing";
  user: FriendUser;
  created_at: string;
};

async function loadProfiles(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  ids: string[],
) {
  if (ids.length === 0) return new Map<string, { id: string; display_name: string; avatar_url: string | null }>();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  const map = new Map<string, { id: string; display_name: string; avatar_url: string | null }>();
  for (const p of (data ?? []) as Array<{ id: string; display_name: string; avatar_url: string | null }>) {
    map.set(p.id, p);
  }
  return map;
}

async function loadPresence(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  ids: string[],
) {
  const map = new Map<string, boolean>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("user_presence")
    .select("user_id, last_seen_at")
    .in("user_id", ids);
  const cutoff = Date.now() - ONLINE_WINDOW_SECONDS * 1000;
  for (const row of (data ?? []) as Array<{ user_id: string; last_seen_at: string }>) {
    map.set(row.user_id, new Date(row.last_seen_at).getTime() >= cutoff);
  }
  return map;
}

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    await supabase
      .from("user_presence")
      .upsert({ user_id: userId, last_seen_at: now, updated_at: now });
    return { ok: true };
  });

export const listFriends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { page?: number }) => ({ page: Math.max(1, d?.page ?? 1) }))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const pageSize = 10;
    const from = (data.page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data: rows, count } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at", { count: "exact" })
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .range(from, to);

    const list = (rows ?? []) as Array<{
      id: string;
      requester_id: string;
      addressee_id: string;
      status: "accepted";
      created_at: string;
    }>;
    const otherIds = list.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const [profiles, presence] = await Promise.all([
      loadProfiles(supabase, otherIds),
      loadPresence(supabase, otherIds),
    ]);

    const friends: FriendshipRow[] = list.map((r) => {
      const otherId = r.requester_id === userId ? r.addressee_id : r.requester_id;
      const p = profiles.get(otherId);
      return {
        id: r.id,
        status: "accepted",
        direction: r.requester_id === userId ? "outgoing" : "incoming",
        created_at: r.created_at,
        user: {
          id: otherId,
          display_name: p?.display_name ?? "Unknown",
          avatar_url: p?.avatar_url ?? null,
          online: presence.get(otherId) ?? false,
        },
      };
    });

    return { friends, total: count ?? 0, pageSize };
  });

export const listPendingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, created_at")
      .eq("status", "pending")
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    const list = (rows ?? []) as Array<{
      id: string;
      requester_id: string;
      addressee_id: string;
      status: "pending";
      created_at: string;
    }>;
    const otherIds = list.map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
    const [profiles, presence] = await Promise.all([
      loadProfiles(supabase, otherIds),
      loadPresence(supabase, otherIds),
    ]);

    const all: FriendshipRow[] = list.map((r) => {
      const incoming = r.addressee_id === userId;
      const otherId = incoming ? r.requester_id : r.addressee_id;
      const p = profiles.get(otherId);
      return {
        id: r.id,
        status: "pending",
        direction: incoming ? "incoming" : "outgoing",
        created_at: r.created_at,
        user: {
          id: otherId,
          display_name: p?.display_name ?? "Unknown",
          avatar_url: p?.avatar_url ?? null,
          online: presence.get(otherId) ?? false,
        },
      };
    });

    return {
      incoming: all.filter((r) => r.direction === "incoming"),
      outgoing: all.filter((r) => r.direction === "outgoing"),
    };
  });

export const sendFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ displayName: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const name = data.displayName.trim().replace(/^_+/, "");
    if (!name) throw new Error("Please enter a username.");

    const { data: target } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", name)
      .maybeSingle();

    if (!target) throw new Error(`No player found with name "${name}".`);
    if ((target as { id: string }).id === userId) throw new Error("You can't add yourself.");

    const targetId = (target as { id: string }).id;

    // Check existing in either direction
    const { data: existing } = await supabase
      .from("friendships")
      .select("id, status, requester_id, addressee_id")
      .or(
        `and(requester_id.eq.${userId},addressee_id.eq.${targetId}),and(requester_id.eq.${targetId},addressee_id.eq.${userId})`,
      )
      .maybeSingle();

    if (existing) {
      const e = existing as { status: string; requester_id: string };
      if (e.status === "accepted") throw new Error("You're already friends.");
      if (e.requester_id === userId) throw new Error("Friend request already sent.");
      throw new Error("This player already sent you a request — check pending.");
    }

    const { error } = await supabase
      .from("friendships")
      .insert({ requester_id: userId, addressee_id: targetId, status: "pending" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const acceptFriendRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friendshipId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("friendships")
      .update({ status: "accepted" })
      .eq("id", data.friendshipId)
      .eq("addressee_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFriendship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ friendshipId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", data.friendshipId)
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
