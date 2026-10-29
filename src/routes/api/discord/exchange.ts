// POST /api/discord/exchange
// Exchanges a Discord OAuth code (from the Embedded App SDK authorize flow)
// for a Bimyah Supabase session. This is where Discord identity linking
// happens: the Discord user is matched to their existing Bimyah player
// record via user_metadata.discord_id, or a new player record is created.
// The Discord client secret never leaves the server.
import { createClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

const DISCORD_API = "https://discord.com/api/v10";

export const Route = createFileRoute("/api/discord/exchange")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const clientId = process.env.DISCORD_CLIENT_ID;
        const clientSecret = process.env.DISCORD_CLIENT_SECRET;
        const supabaseUrl = process.env.SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!clientId || !clientSecret || !supabaseUrl || !serviceKey) {
          return Response.json({ error: "Server configuration error" }, { status: 500 });
        }

        let code: string;
        try {
          const body = await request.json();
          code = String(body.code ?? "");
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

        // 1. Exchange the code for a Discord access token (server-side only).
        let discordToken: string;
        try {
          const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "authorization_code",
              code,
            }),
          });
          const tokenData = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
          if (!tokenRes.ok || !tokenData.access_token) {
            return Response.json({ error: "Discord authorization failed" }, { status: 401 });
          }
          discordToken = tokenData.access_token;
        } catch {
          return Response.json({ error: "Discord authorization failed" }, { status: 502 });
        }

        // 2. Fetch the Discord user.
        let discordUser: {
          id: string;
          username: string;
          global_name?: string | null;
          avatar?: string | null;
        };
        try {
          const meRes = await fetch(`${DISCORD_API}/users/@me`, {
            headers: { authorization: `Bearer ${discordToken}` },
          });
          if (!meRes.ok)
            return Response.json({ error: "Discord authorization failed" }, { status: 401 });
          discordUser = await meRes.json();
        } catch {
          return Response.json({ error: "Discord user lookup failed" }, { status: 502 });
        }
        const discordId = String(discordUser.id);
        const displayName = (discordUser.global_name || discordUser.username || "Player").slice(
          0,
          14,
        );
        const avatarUrl = discordUser.avatar
          ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png`
          : null;

        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // 3. Find the existing Bimyah player linked to this Discord id.
        let authUserId: string | null = null;
        let authEmail: string | null = null;
        try {
          let page = 1;
          for (;;) {
            const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
            if (error) throw error;
            const match = data.users.find(
              (u) =>
                (u.user_metadata as unknown as { discord_id?: string } | null)?.discord_id ===
                discordId,
            );
            if (match) {
              authUserId = match.id;
              authEmail = match.email ?? null;
              break;
            }
            if (data.users.length < 200) break;
            page += 1;
            if (page > 50) break; // safety cap
          }
        } catch {
          return Response.json({ error: "Account lookup failed" }, { status: 500 });
        }

        // 4. Create the player record on first Discord sign-in. The
        // handle_new_user trigger builds the profile row from user_metadata,
        // so display name + avatar land in the same profiles table the web
        // game uses. One shared record across both builds.
        if (!authUserId) {
          const email = `discord-${discordId}@players.bimyah.local`;
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            email_confirm: true,
            user_metadata: {
              discord_id: discordId,
              discord_username: discordUser.username,
              display_name: displayName,
              avatar_url: avatarUrl,
              signup_source: "discord",
            },
          });
          if (createErr || !created.user) {
            return Response.json({ error: "Account creation failed" }, { status: 500 });
          }
          authUserId = created.user.id;
          authEmail = email;
        } else {
          // Keep the linked profile fresh (name/avatar changes on Discord).
          try {
            await admin.auth.admin.updateUserById(authUserId, {
              user_metadata: {
                discord_id: discordId,
                discord_username: discordUser.username,
                display_name: displayName,
                avatar_url: avatarUrl,
              },
            });
            await admin
              .from("profiles")
              .update({
                display_name: displayName,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString(),
              })
              .eq("id", authUserId);
          } catch {
            /* best-effort */
          }
        }

        // 5. Mint a Supabase session via magic link. This NEVER touches the
        // user's password. The old code overwrote the password with a random
        // one, which would destroy a linked web account's password.
        if (!authEmail) return Response.json({ error: "Account lookup failed" }, { status: 500 });
        const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
          type: "magiclink",
          email: authEmail,
        });
        const otp = (linkData as { properties?: { email_otp?: string } } | null)?.properties?.email_otp;
        if (linkErr || !otp) {
          return Response.json({ error: "Sign-in failed" }, { status: 500 });
        }
        const { data: sessionData, error: verifyErr } = await admin.auth.verifyOtp({
          type: "magiclink",
          email: authEmail,
          token: otp,
        });
        if (verifyErr || !sessionData.session) {
          return Response.json({ error: "Sign-in failed" }, { status: 500 });
        }

        return Response.json({
          access_token: sessionData.session.access_token,
          refresh_token: sessionData.session.refresh_token,
          discord_user_id: discordId,
        });
      },
    },
  },
});
