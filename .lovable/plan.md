# Admin-Configurable Victory Effects

Today every victory product is just an image overlay (`winner.victoryUrl`) and the only animated effect is the built-in `<Confetti />`. We'll extend Bmart victory items so an admin can pick from a library of animated presets (or keep the image overlay), and the game renders the matching effect when the equipped item is owned.

## 1. Data model

Add one column to `bmart_products` (used only by `category = 'victory'`):
- `effect_type TEXT NULL` — preset key. `null` = legacy image overlay using `image_url`.

Preset keys shipped in v1: `confetti`, `fireworks`, `falling_stars`, `falling_roses`, `snow`, `hearts`, `coins`, `bubbles`, `sparkles`, `lightning`.

(Optional follow-up: `effect_config JSONB` for per-product color/density tuning. Out of scope for v1.)

## 2. Effect component library

Create `src/components/game/VictoryEffects.tsx` exporting one component per preset. Each is a fixed full-viewport overlay (`pointer-events-none fixed inset-0 z-50`) built with CSS keyframes + a small particle generator (same pattern as the existing `Confetti`). No new deps.

A registry maps key → component:
```ts
export const VICTORY_EFFECTS: Record<string, FC> = {
  confetti: ConfettiEffect,
  fireworks: FireworksEffect,
  falling_stars: FallingStarsEffect,
  falling_roses: FallingRosesEffect,
  snow: SnowEffect,
  hearts: HeartsEffect,
  coins: CoinsEffect,
  bubbles: BubblesEffect,
  sparkles: SparklesEffect,
  lightning: LightningEffect,
};
```

Add the matching `@keyframes` in `src/styles.css` (fall, drift, burst, twinkle).

## 3. Carry effect_type through cosmetics

- Extend the equipped victory payload to include `effectType` alongside `victoryUrl`:
  - `src/lib/rpc/cosmetics.functions.ts` — join `bmart_products.effect_type` when resolving the equipped victory item.
  - `src/game/types.ts` — add `victoryEffectType?: string | null` on `Player`.
  - `src/game/cosmetics.ts` — pass-through in `applyDecorOverrides`.
  - `src/game/engine.ts` / room creation — propagate the field onto the host/player record (same path used today for `victoryUrl`).

## 4. Render

In `src/components/game/GameTable.tsx` (around line 1242), replace the current `victoryUrl ? <img/> : <Confetti/>` block with:

```tsx
const EffectComp = winner?.victoryEffectType ? VICTORY_EFFECTS[winner.victoryEffectType] : null;
return EffectComp
  ? <EffectComp />
  : winner?.victoryUrl
    ? <img ... />               // legacy image overlay
    : <Confetti />;             // default
```

This keeps the existing "exclusive layer" rule from the decor plan — only one victory layer renders.

## 5. Admin UI

In `src/components/admin/BmartAdminTab.tsx`, when editing a product whose category is `victory`, show a new **Effect** dropdown:
- "Image overlay (use Image URL)" — `effect_type = null`
- One option per preset key with a short label and a small live-preview button that mounts the component for ~3s.

Wire it through `upsertBmartProduct`:
- `src/lib/rpc/bmart.functions.ts` — extend `upsertSchema` with `effect_type: z.enum([...PRESET_KEYS]).nullable().optional()` and pass through to the upsert.

## 6. Default-item story

Built-in `Confetti` stays as the fallback when no victory item is equipped. To let admins replace the default confetti too, the existing `decor_defaults` flow (from the decor plan) can be reused: store `default_key = 'confetti'` with an `effect_type_override`. Not required for v1.

## Files

**Created**
- `src/components/game/VictoryEffects.tsx`

**Edited**
- `supabase/migrations/<ts>_victory_effect_type.sql` (adds the column)
- `src/lib/rpc/bmart.functions.ts`
- `src/lib/rpc/cosmetics.functions.ts`
- `src/components/admin/BmartAdminTab.tsx`
- `src/components/game/GameTable.tsx`
- `src/game/types.ts`
- `src/game/cosmetics.ts`
- `src/game/engine.ts`
- `src/styles.css` (new keyframes)

## Out of scope
- Per-product color/intensity tuning (`effect_config`)
- User-uploaded Lottie / video effects (presets only in v1)
- Replacing the built-in default confetti via admin UI (handled by decor_defaults later)
