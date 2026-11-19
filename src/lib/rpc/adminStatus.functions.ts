import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Whether the signed-in user holds the admin role. A user can carry
 * several user_roles rows (one per role), so this is an existence check
 * for an 'admin' row, not a single-row read. Used to gate admin-only
 * surfaces. (It briefly gated the Guided Tutorial too, until Ronya
 * opened the tutorial to everyone on 2026-11-18.)
 */
export const getMyAdminStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .limit(1);
    return { isAdmin: !!data && data.length > 0 };
  });
