import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sendSchema = z.object({
  recipient: z.string().trim().min(1).max(255),
  amount: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().max(140).optional(),
});

async function resolveRecipient(identifier: string, selfId: string) {
  const trimmed = identifier.trim();
  const lower = trimmed.toLowerCase();

  if (trimmed.includes("@")) {
    // email lookup
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error("Recipient lookup failed");
    const match = users?.users.find((u) => u.email?.toLowerCase() === lower);
    if (!match) throw new Error("No player found with that email");
    if (match.id === selfId) throw new Error("You cannot send Bimbucks to yourself");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .eq("id", match.id)
      .maybeSingle();
    return { id: match.id, display_name: prof?.display_name ?? "Player" };
  }

  // display name lookup (case-insensitive)
  const { data: profs, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", trimmed)
    .limit(2);
  if (error) throw new Error("Recipient lookup failed");
  if (!profs || profs.length === 0) throw new Error("No player found with that name");
  if (profs.length > 1) throw new Error("Multiple players match that name — use an email instead");
  if (profs[0].id === selfId) throw new Error("You cannot send Bimbucks to yourself");
  return { id: profs[0].id as string, display_name: profs[0].display_name as string };
}

export const sendBimbucks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const recipient = await resolveRecipient(data.recipient, context.userId);

    const { data: result, error } = await supabaseAdmin.rpc("transfer_bimbucks", {
      _sender_id: context.userId,
      _recipient_id: recipient.id,
      _amount: data.amount,
      _note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      recipient_name: recipient.display_name,
      amount: data.amount,
      sender_bimbucks: (result as { sender_bimbucks: number })?.sender_bimbucks ?? 0,
    };
  });

export const listUnseenTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("bimbuck_transfers")
      .select("id, sender_id, amount, note, created_at")
      .eq("recipient_id", context.userId)
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return { rows: [] as Array<{ id: string; sender_name: string; amount: number; note: string | null; created_at: string }> };

    const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);
    const nameById = new Map<string, string>();
    for (const p of profs ?? []) nameById.set(p.id as string, (p.display_name as string) ?? "Player");

    return {
      rows: rows.map((r) => ({
        id: r.id as string,
        sender_name: nameById.get(r.sender_id as string) ?? "Player",
        amount: r.amount as number,
        note: (r.note as string | null) ?? null,
        created_at: r.created_at as string,
      })),
    };
  });

const markSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });
export const markTransfersSeen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => markSchema.parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("bimbuck_transfers")
      .update({ seen_at: new Date().toISOString() })
      .eq("recipient_id", context.userId)
      .in("id", data.ids);
    return { ok: true };
  });
