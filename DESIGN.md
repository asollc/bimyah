---
name: Bimyah!
description: Fast, no-turns card race game
colors:
  background: "oklch(0.16 0.06 20)"
  foreground: "oklch(0.97 0.02 20)"
  card: "oklch(0.22 0.08 22)"
  primary: "oklch(0.62 0.24 25)"
  secondary: "oklch(0.28 0.08 22)"
  muted: "oklch(0.28 0.08 22)"
  accent: "oklch(0.85 0.16 90)"
  mint: "oklch(0.7 0.22 28)"
  gold: "oklch(0.85 0.16 90)"
  border: "oklch(0.35 0.08 22 / 50%)"
typography:
  display:
    fontFamily: "Sora, sans-serif"
    fontWeight: 800
  body:
    fontFamily: "Manrope, sans-serif"
rounded:
  sm: "calc(0.75rem - 4px)"
  md: "calc(0.75rem - 2px)"
  lg: "0.75rem"
  xl: "calc(0.75rem + 4px)"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
---

# Design System: Bimyah!

## Overview
Dark, high-energy card game interface. Crimson-dark surfaces with mint and gold accents. Bold display typography for game UI, clean body text for readability.

## Colors
Dark crimson base with vibrant accents.

### Primary
- **Crimson** (oklch(0.62 0.24 25)): Primary actions, key interactive elements

### Secondary
- **Mint** (oklch(0.7 0.22 28)): Highlights, success states, active indicators
- **Gold** (oklch(0.85 0.16 90)): Premium accents, rewards

### Neutral
- **Background** (oklch(0.16 0.06 20)): App background, dark crimson
- **Card** (oklch(0.22 0.08 22)): Card surfaces, elevated from background
- **Foreground** (oklch(0.97 0.02 20)): Primary text

## Typography
**Display Font:** Sora (sans-serif)
**Body Font:** Manrope (sans-serif)

## Layout
Mobile-first, responsive. Game UI prioritizes touch targets and readability during fast play.

## Elevation & Depth
Tonal layering on dark surfaces. Cards elevate from background via lighter crimson tones.

## Shapes
Rounded corners (0.75rem base radius). Cards and buttons use medium to large radius.

## Components
### Buttons
- Primary: crimson background, bold display font, rounded
- Accent actions use mint for high-visibility game actions (e.g. BIMYAH! button)

## Do's and Don'ts
### Do:
- **Do** keep text high-contrast against dark surfaces
- **Do** use mint sparingly for the most important actions

### Don't:
- **Don't** use em dashes in user-facing copy
- **Don't** add B+ upsell or purchase UI inside the Discord Activity
