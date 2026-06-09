# The Next Semis

A Vercel-native portfolio and research dashboard built around one question: **where is the next AI-scale industry boom forming, and can I get there before the consensus does?**

"The next semis" is a frame, not a target. The semiconductor boom of the 2010s-2020s is the historical anchor, but the hunt is for whatever comes next: power, memory, robotics, biotech compute, novel materials, or another physical constraint that is still underpriced.

**Status: shipped. The codebase is complete.**

## What It Does

- **Portfolio overview.** Current positions with live quote refresh, day movers, cost basis, and PnL.
- **Sector allocation.** Bar chart on the portfolio page showing capital distribution by sector and watchlist theme coverage (watching vs. actually holding).
- **Research watchlist.** Companies grouped by theme, conviction, and status — with entry conditions and a buy trigger field ("what would make me pull the trigger").
- **Ticker deep-dives.** Per-ticker pages with live quote, price chart, entry conditions, buy trigger, reading list, news feed, and research docs.
- **Reading list.** Saved articles and papers scoped to tickers or themes.
- **Research docs.** PDF/markdown upload via Vercel Blob, accessible on the research page.

## Stack

- **Next.js App Router + TypeScript** — Vercel-first.
- **Vercel Hobby** — hosting target.
- **Yahoo Finance** — quote, history, news via server-side fetches and API routes.
- **Upstash Redis** — persisted writes (watchlist edits, reading list, research docs). Local JSON fallback for dev.
- **Zod** — validates all JSON data before the UI touches it.
- **TradingView Lightweight Charts** — financial-native chart rendering.
- **Plain CSS design tokens** — monochrome visual system, dark/light theme toggle.

The previous Phoenix LiveView implementation is preserved on branch `archived`.

## Running Locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Admin features require the env vars below.

## Environment Variables

Required in production:

```
ADMIN_USERNAME
ADMIN_PASSWORD
JWT_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Upstash Redis is mandatory on Vercel — without it, all write paths fail closed by design.

Optional:

```
BRANDFETCH_API_KEY   # vendor fallback for brand colors when public detection fails
```
