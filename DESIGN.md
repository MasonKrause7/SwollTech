# SwollTech design system: chalk and iron

Gritty, but professional. The grit lives in texture and imagery (film grain, concrete, the mascot art). The controls stay plain, flat and precise, like a modern product app.

Source of truth: `apps/web/src/styles.css` (CSS custom properties) and `apps/mobile/src/theme.ts`. Change a colour in both.

## Principles

1. **Monochrome first.** Iron surfaces and chalk text do almost all the work.
2. **One hot colour, used sparingly.** Orange means records, streaks, progress and "you are here" (active tab, focus). It is never a button colour.
3. **Chalk is the primary action.** The primary button is chalk on iron (iron on chalk in light mode). One primary per view; everything else is secondary or quiet.
4. **Grit stays out of the controls.** No skewed buttons, hard shadows, outlines on type or tilted cards. Texture goes on the page grain and on hero panels only.
5. **Dark by default.** It's a gym. Light mode exists and uses the same roles; hero panels stay dark in both.

## Colour

| Role | Token (web) | Mobile key | Dark | Light |
| --- | --- | --- | --- | --- |
| Page | `--bg` | `bg` | `#0F1011` | `#F4F4F2` |
| Card | `--raised` | `raised` | `#17181A` | `#FFFFFF` |
| Hover, selected, track | `--raised-2` | `track` | `#1F2023` | `#ECECEA` |
| Input well | `--sunk` | | `#0A0B0C` | `#EBEBE8` |
| Hairline | `--line` | `line` | `#26282B` | `#DEDED9` |
| Strong hairline | `--line-strong` | | `#383B3F` | `#C6C6C0` |
| Text | `--text` | `text` | `#F4F4F2` | `#0F1011` |
| Supporting text | `--muted` | `muted` | `#8E9196` | `#5E6166` |
| Placeholder | `--subtle` | | `#63666B` | `#8A8D92` |
| Primary button | `--primary` / `--on-primary` | `accent` / `accentInk` | chalk / iron | iron / chalk |
| Secondary button | `--secondary` | | `#232427` | `#E6E6E2` |
| Highlight | `--accent` | `highlight` | `#FF5A1F` | `#E4480E` |
| Highlight text | `--accent-text` | | `#FF7A47` | `#C23C0A` |
| Highlight wash | `--accent-soft` | | orange 13% | orange 10% |
| Danger | `--danger` | `danger` | `#F0524F` | `#C62F2F` |
| Success | `--ok` | `ok` | `#3CCB7F` | `#1F8A52` |

Naming note: on mobile `accent` is the primary-action colour and `highlight` is the orange. On web `--primary` is the action colour and `--accent` is the orange.

**Data series**, in order: `--data-1` orange, `--data-2` chalk, `--data-3` steel blue, `--data-4` sand, `--data-5` grey, `--data-6` sage. A single-series chart uses chalk; use orange for the series that is "the point" (estimated max, the current week).

**Plate colours** (`--plate-*`, `plate`) are the real competition plate colours. Use them only to draw plates.

## Type

- **Display:** Barlow Condensed, upright, uppercase. 700 for page titles, 600 for section titles and numbers. Small tracking (0.01 to 0.03em).
- **Eyebrow:** Barlow Condensed 600, 0.85rem, 0.14em tracking, uppercase, muted. Use it above a hero title.
- **Body:** Barlow 400/500/600, sentence case. Buttons and labels are sentence case too.
- **Numbers:** always tabular (`.num`, `font-variant-numeric: tabular-nums`).

Scale (web): h1 2.25 to 3rem, h2 1.4rem, h3 1.15rem, body 1rem, small 0.875rem, stat value 2.4rem.

## Shape and space

- Radius: 6 (small), 10 (controls), 14 (cards), 18 to 20 (focus card, hero, sheets).
- Hairline borders, 1px. Shadows only on floating layers (rest timer, toast, dialog).
- Spacing steps: 4, 8, 12, 16, 20, 24, 32. Page sections are 32px apart on web.
- Touch targets: 44px minimum on web, 52px on mobile.

## Components

- **Buttons:** 44px tall (56px `big`), radius 10, weight 600. Variants: `primary` (chalk), default secondary, `quiet` (text only), `danger` (outlined red). Press scales to 0.98. Never skewed, never uppercase.
- **Inputs:** sunk well, hairline border, orange border plus soft orange ring on focus.
- **Cards and lists:** `--raised` with a hairline. Rows highlight with `--raised-2` on hover. Lists are bordered rows, not stacked cards.
- **Stats:** one bordered strip split by hairlines; condensed number over a muted label. Orange only when the number is a record or streak.
- **Navigation:** the active item gets `--raised-2` and an orange icon (web rail and tab bar) or an orange bar (mobile tab bar).
- **Records:** orange wash card (`.record-card`) with an orange trophy.
- **Hero panels** (`.auth-art`, `.summary-hero`): always dark, with concrete texture and a soft overhead light. This is the only place art and texture appear.

## Texture and art

- **Film grain:** a fixed `body::after` overlay at 5% (dark) and 3.5% (light). Don't stack more grain on top.
- **Concrete:** generated SVG noise on hero panels only.
- **Art slots:** `<div class="hero-art" data-label="…">` shows a quiet dashed marker until real art is set with `style={{ "--art": "url(/art/mascot.webp)" }}`. The sign-in screen has one for the full-body mascot (transparent PNG or WebP, about 1200×1500).
- **Logo:** none for now. The product name is set in plain display type until the real logo arrives.
