# Plan: Robust Brand-Color Detection (no manual override map)

**For:** Sonnet 4.6 (implementer)
**Goal:** `/api/brand-color` should detect each company's true brand color automatically,
every time, with **zero hardcoded color values**. Delete `BRAND_OVERRIDES`. The two
cases that currently force a manual override — Hyperliquid (SPA, turquoise) and Palantir
(monochrome, white) — must be solved by *detection*, not a lookup table.

---

## Why the current pipeline fails (root causes — verified empirically)

| Company | Truth | Current result | Why |
|---|---|---|---|
| RTX | `#ce1126` red (197× in `rtx-colors.css`) | flips red↔cyan with the stylesheet fetch cap | brand color lives in the 6th stylesheet; a vivid minor accent (`#00a9e0`, 7×) wins when that sheet isn't fetched. Frequency vs per-color-signal is unstable. |
| Palantir | none (white/black wordmark) | favicon pixel analysis returned red | monochrome brands have no color; detection relied on a brittle `"logo on black"` string match, and favicon pixels are noise |
| Hyperliquid | `#96fbd4` turquoise | nothing (SSR HTML/CSS has no color) | client-rendered SPA: color lives in JS bundles / web manifest / logo asset, none of which the HTML+CSS scraper reads |

**The core problem:** the pipeline guesses from whatever hex strings it can scrape and
ranks them by a saturation heuristic. It has no notion of *confidence* or *source
authority*, so a declared brand token and an incidental UI accent compete on equal footing.

---

## Design principle

Rank signals by **source authority**, not just color vividness. A color a company
*declares* (manifest, theme-color meta, a CSS var literally named `--brand`) is worth far
more than a color merely *present* on the page. Only fall back to statistical extraction
(frequency-weighted dominant saturated color) when no declared signal exists. Below a
confidence floor, return `null` → the UI uses the theme accent (this is the *correct*
answer for monochrome brands like Palantir).

---

## Signal sources, in priority order

Implement each as a small function returning `{ color: string; confidence: number } | null`.
Collect all that fire, then pick the highest confidence. Cache the verdict (incl. `null`)
in Redis with the existing `__none__` sentinel.

1. **Web app manifest** (`confidence: 0.95`) — fetch `/manifest.json` and
   `/site.webmanifest` (and any `<link rel="manifest">` href). Read `theme_color`, then
   `background_color`. **This is how Hyperliquid is solved** — PWAs/SPAs declare their
   brand color here even when the HTML is an empty shell. Reject white/black/near-grey.

2. **`theme-color` meta tag** (`confidence: 0.9`) — already implemented (`themeColor()`).

3. **Named brand CSS custom properties** (`confidence: 0.85`) — across the homepage HTML
   and all brand stylesheets, match declarations like
   `--brand`, `--brand-primary`, `--color-primary`, `--accent`, `--primary` →
   `#hex`/`rgb()`. A var *named* for the brand is a strong declared signal. Take the most
   saturated non-mono value among them.

4. **SVG logo fill** (`confidence: 0.85`) — find the logo: `<link rel="icon">` pointing at
   an `.svg`, or an `<img>/<svg>` whose `alt`/`class`/`src` contains "logo". Fetch the SVG,
   extract `fill=`/`stroke=`/inline `style` hex values, drop black/white/grey, take the
   dominant non-mono fill. SVG logos contain the *exact* brand hex — very reliable when
   present.

5. **Frequency-weighted dominant color across ALL brand stylesheets** (`confidence: 0.6`) —
   the current `extractTextAccent`, but: (a) fetch **all** same-origin stylesheets (no
   cap-of-4 truncation — that's what broke RTX), with a sane total-bytes ceiling instead of
   a count cap; (b) keep summing `signal × occurrences` so the genuinely dominant brand
   color (RTX's 197× red) wins decisively over incidental accents.

6. **Favicon/logo PNG pixel analysis** (`confidence: 0.4`) — current `extractPngAccent`,
   demoted to last resort only.

---

## Monochrome detection (replaces the `"logo on black"` string hack)

A brand is monochrome when its strongest signal is black/white/grey. Decide it
*structurally*, not by scraping a marketing string:

- If the SVG logo (source 4) contains only black/white/grey fills → **monochrome**.
- If the only colors that survive across sources have saturation < ~0.15 → **monochrome**.
- Monochrome ⇒ return `null` (confidence high). **This is how Palantir is solved** — its
  logo SVG is a single black/white wordmark, so detection yields "no brand color" → UI
  accent. No override needed.

---

## Confidence floor

After collecting signals, if the best confidence < ~0.55 **and** the color isn't
corroborated by a second source, return `null`. Better to fall back to the clean theme
accent than to ship a wrong vivid color. (A wrong color is more jarring than the neutral
accent — that's the lesson from Palantir-red.)

---

## Concrete deliverables

- [ ] Delete `BRAND_OVERRIDES` / `lookupOverride` from `app/api/brand-color/route.ts`.
- [ ] Add `fetchManifestColor(domain, html)` (source 1).
- [ ] Add `extractBrandVarColor(text)` for named CSS custom properties (source 3).
- [ ] Add `fetchSvgLogoColor(domain, html)` + SVG hex parsing (source 4).
- [ ] Add `isMonochrome(signals)` structural check; remove `isExplicitMonochromeBrandPage`.
- [ ] Remove the stylesheet count cap; add a total-bytes budget (e.g. ≤ 1.5 MB) instead.
- [ ] Rewrite `resolveColor` to gather all signals, pick max-confidence, apply the floor.
- [ ] Keep Redis caching with the `__none__` sentinel; bump the cache key version.
- [ ] Bump the client `use-brand-color.ts` cache prefix to bust stale entries.

## Verification (mandatory — run the dev server, curl the real API)

Confirm against live data, not theory:

| Ticker / company | Expected |
|---|---|
| `PURR` / Hyperliquid Strategies Inc | turquoise ≈ `#96fbd4` (from manifest, **not** an override) |
| `PLTR` / Palantir Technologies Inc. | `null` (monochrome → theme accent) |
| `RTX` / RTX Corporation | red `#ce1126` (frequency-weighted dominant) |
| `NVDA` / NVIDIA Corporation | green ≈ `#76B900` |
| `ASML` / ASML Holding N.V. | blue ≈ `#10069F` |
| `LMT` / Lockheed Martin Corporation | blue |

For each: `curl "localhost:3000/api/brand-color?ticker=<T>&company=<C>"`. Then load
`/research/<ticker>` in a browser and confirm the symbol + chart line use the color.
Do **not** declare done until Hyperliquid resolves turquoise with the override map deleted.

## Notes / constraints

- Vercel Hobby + free only. No paid brand APIs (Brandfetch etc.), no headless browser
  (Playwright too heavy for the function budget). Everything above is plain `fetch` + parse.
- This endpoint is **unauthenticated and public** (logged-out users see ticker colors).
  Keep it that way, but do **not** reintroduce attacker-influenceable domain guessing
  (`verifyGeneratedDomain` was removed for SSRF/abuse reasons). Resolve domains via Clearbit
  suggest + scoring only.
- Cap total outbound fetches per request (manifest + html + N stylesheets + 1 logo) and keep
  per-fetch `AbortSignal.timeout`.
