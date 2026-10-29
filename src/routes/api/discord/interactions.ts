// POST /api/discord/interactions
// Handles Discord slash command interactions for the Bimyah app.
// Verifies Discord's Ed25519 signature, responds to PING, and handles /play.
import { createFileRoute } from "@tanstack/react-router";

// Discord public key for the Bimyah app (not secret)
const DISCORD_PUBLIC_KEY = "9d8ad0b463c02515345e64e15fef90e95fbb6aa2c9a3bdca0ebe188cc53d44af";

async function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = new Uint8Array(
      publicKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const sigData = new Uint8Array(
      signatureHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    const data = encoder.encode(timestamp + body);
    return await crypto.subtle.verify("Ed25519", key, sigData, data);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/discord/interactions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("x-signature-ed25519");
        const timestamp = request.headers.get("x-signature-timestamp");
        const body = await request.text();

        if (!signature || !timestamp) {
          return Response.json({ error: "Missing signature" }, { status: 401 });
        }

        const valid = await verifySignature(
          DISCORD_PUBLIC_KEY,
          signature,
          timestamp,
          body
        );
        if (!valid) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }

        const interaction = JSON.parse(body);

        // PING (type 1) -> PONG (type 1)
        if (interaction.type === 1) {
          return Response.json({ type: 1 });
        }

        // Slash command (type 2)
        if (interaction.type === 2) {
          const commandName = interaction.data?.name;

          if (commandName === "play") {
            // Respond with the Activity URL. Discord auto-generates the rich
            // game card embed (like pasting the link manually).
            return Response.json({
              type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
              data: {
                content: "https://discord.com/activities/1560384511793958922",
              },
            });
          }

          // Unknown command
          return Response.json({
            type: 4,
            data: {
              content: "Unknown command.",
              flags: 64,
            },
          });
        }

        return Response.json({ error: "Unknown interaction type" }, { status: 400 });
      },
    },
  },
});
