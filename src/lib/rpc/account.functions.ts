import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Permanently delete the signed-in user's account and every record tied to
 * it. The production schema has no foreign keys (and no ON DELETE CASCADE)
 * pointing at auth.users or profiles, so each table is cleaned explicitly.
 *
 * Order matters:
 *  1. Guard: Bimyah!+ is sold as one-time lifetime purchases, so there is
 *     normally nothing recurring to cancel. If a subscription row ever
 *     carries a live Stripe/PayPal subscription id, deletion aborts so the
 *     recurring billing can be cancelled first instead of charging a
 *     deleted account.
 *  2. Remove the user's uploaded files (avatar + card backs).
 *  3. Delete rows from every table keyed by the user's id or email.
 *  4. Delete the auth user itself.
 *
 * Ephemeral match state is out of scope by design: discord_games and the
 * `state` JSON of in-progress games are transient session blobs, not
 * account records, and expire with the match.
 */

// The generated Database types predate a few tables (discord_*), so the
// cleanup runs through an untyped handle on the service-role client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

/** Tables with a plain user_id column holding the account's own rows. */
const TABLES_BY_USER_ID = [
  "bulletin_hides",
  "bulletin_reads",
  "card_backs",
  "challenge_match_reports",
  "founding_members",
  "payments",
  "purchase_ledger",
  "push_debug_log",
  "push_subscriptions",
  "share_events",
  "subscriptions",
  "user_challenges",
  "user_equipped",
  "user_inventory",
  "user_keybinds",
  "user_presence",
  "user_roles",
  "wallets",
] as const;

/** Tables where the user appears under a role-specific id column. */
const TABLES_BY_ROLE_COLUMN: Array<[string, string]> = [
  ["bimbuck_transfers", "sender_id"],
  ["bimbuck_transfers", "recipient_id"],
  ["bplus_gifts", "purchaser_id"],
  ["bplus_gifts", "recipient_user_id"],
  ["bug_reports", "user_id"],
  ["bulletins", "author_id"],
  ["friendships", "requester_id"],
  ["friendships", "addressee_id"],
  ["games", "host_id"],
  ["how_to_videos", "author_id"],
  ["public_matches", "host_id"],
  ["referrals", "referrer_id"],
  ["referrals", "referred_id"],
];

/** Tables keyed by the account's email address instead of its id. */
const TABLES_BY_EMAIL: Array<[string, string]> = [
  ["bug_reports", "user_email"],
  ["email_send_log", "recipient_email"],
  ["email_unsubscribe_tokens", "email"],
  ["suppressed_emails", "email"],
];

const STORAGE_BUCKETS = ["avatars", "card-backs"] as const;

async function deleteFrom(table: string, column: string, value: string) {
  const { error } = await db.from(table).delete().eq(column, value);
  if (error) {
    throw new Error(`Could not remove your data from ${table}: ${error.message}`);
  }
}

async function guardNoRecurringBilling(userId: string) {
  const { data: rows, error } = await db
    .from("subscriptions")
    .select("stripe_subscription_id, paypal_subscription_id, status")
    .eq("user_id", userId);
  if (error) {
    throw new Error(`Could not check your subscriptions: ${error.message}`);
  }
  const recurring = (
    (rows ?? []) as Array<{
      stripe_subscription_id: string | null;
      paypal_subscription_id: string | null;
      status: string;
    }>
  ).some(
    (r) =>
      r.status === "active" &&
      (r.stripe_subscription_id !== null || r.paypal_subscription_id !== null),
  );
  if (recurring) {
    throw new Error(
      "Your account has a recurring Bimyah!+ subscription. Email info@playbimyah.com so we can cancel the billing first, then delete your account.",
    );
  }
}

async function removeStorageFiles(userId: string) {
  for (const bucket of STORAGE_BUCKETS) {
    const { data: entries, error: listError } = await supabaseAdmin.storage
      .from(bucket)
      .list(userId);
    if (listError) {
      throw new Error(`Could not list your files in ${bucket}: ${listError.message}`);
    }
    const paths = (entries ?? [])
      .filter((e) => e.id)
      .map((e) => `${userId}/${e.name}`);
    if (paths.length === 0) continue;
    const { error: removeError } = await supabaseAdmin.storage
      .from(bucket)
      .remove(paths);
    if (removeError) {
      throw new Error(`Could not remove your files in ${bucket}: ${removeError.message}`);
    }
  }
}

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;

    const { data: authRes } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authRes?.user?.email ?? null;

    await guardNoRecurringBilling(userId);
    await removeStorageFiles(userId);

    for (const table of TABLES_BY_USER_ID) {
      await deleteFrom(table, "user_id", userId);
    }
    for (const [table, column] of TABLES_BY_ROLE_COLUMN) {
      await deleteFrom(table, column, userId);
    }
    if (email) {
      for (const [table, column] of TABLES_BY_EMAIL) {
        await deleteFrom(table, column, email);
      }
    }

    await deleteFrom("profiles", "id", userId);

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (authError) {
      throw new Error(`Could not delete your account: ${authError.message}`);
    }

    return { ok: true };
  });
