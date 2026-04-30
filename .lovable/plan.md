## Goal
Show a preview of the OG image inside the Share popover on the home screen, so users see what the social-media preview will look like before they share.

## Changes

### `src/routes/index.tsx` — `SharePopover` component
1. Add a new constant near `SHARE_TEXT` / `SHARE_URL`:
   ```ts
   const SHARE_IMAGE = "https://qorqfqwjmkyosplldovh.supabase.co/storage/v1/object/public/public-assets/og-bimyah.jpg";
   ```
   (Same URL already used in the route's `og:image` meta tag — single source of truth.)

2. Inside `<PopoverContent>`, above the "Share Bimyah!" header, add a preview card that mimics a social link preview:
   - Thumbnail: `<img src={SHARE_IMAGE} />` rendered at full popover width with `aspect-[1.91/1]` (the standard OG ratio), `object-cover`, rounded corners, subtle mint border.
   - Below the image: small stacked text block showing `playbimyah.com` (muted, uppercase tracking) and the share text in one truncated line — so users see exactly what their followers will see.
   - `loading="lazy"` and explicit `alt="Bimyah! card game preview"` for a11y.

3. Slightly widen the popover (`w-64` → `w-72`) so the preview image has room to breathe without crowding the 4-column platform grid.

### Behavior / non-changes
- No change to share intents, analytics tracking, or the routes' SEO meta tags.
- No new dependencies, no asset additions — reuses the existing OG image already hosted in Supabase storage.
- No backend or DB changes.

## Visual result
When the user taps the share icon next to their avatar, the popover opens with:
- OG image preview card at the top
- "Share Bimyah!" label
- 4×2 grid of platform icons (X, Facebook, WhatsApp, Telegram, LinkedIn, Reddit, Email, Copy link)
- Footer hint about Instagram/TikTok/Snapchat

## Files touched
- `src/routes/index.tsx` (only the `SharePopover` component + one new constant)