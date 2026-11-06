# Deploying Bimyah to Cloudflare

## One-time setup

1. Create a Cloudflare API token at https://dash.cloudflare.com/profile/api-tokens
   with the **Workers Scripts: Edit** permission (template: "Edit Cloudflare Workers").
2. Add two secrets to the GitHub repo (Settings > Secrets and variables > Actions):
   - `CLOUDFLARE_API_TOKEN` = the token from step 1
   - `CLOUDFLARE_ACCOUNT_ID` = your account ID (found on the Workers overview page)
3. Merge the `delovable` branch into `main`.

Every push to `main` after that auto-deploys to Cloudflare Workers.

## Manual deploy

```bash
npx wrangler deploy
```

(Requires `CLOUDFLARE_API_TOKEN` in your environment.)

## Environment variables

The app needs these Supabase values at build time:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

And at runtime (Worker secrets via `wrangler secret put`):
- `SUPABASE_SERVICE_ROLE_KEY`

See `.env.example` if present, or ask Gigi.
