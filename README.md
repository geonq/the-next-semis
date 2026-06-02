# The Next Semis

A Vercel-native portfolio and research dashboard built around one question: **where is the next AI-scale industry boom forming, and can I get there before the consensus does?**

"The next semis" is a frame, not a target. The semiconductor boom of the 2010s-2020s is the historical anchor, but the hunt is for whatever comes next: power, memory, robotics, biotech compute, novel materials, or another physical constraint that is still underpriced.

## What It Does

- **Portfolio overview.** Current positions with quote refresh, day movers, cost basis, allocation, and PnL.
- **Research watchlist.** Companies grouped by theme, conviction, and status, with conditions that would confirm or invalidate the thesis.
- **Ticker deep-dives.** Per-ticker pages with current quote data, a TradingView Lightweight Charts candlestick pane, and entry conditions.

## Stack

- **Next.js App Router + TypeScript** for a Vercel-first deployment path.
- **Vercel Hobby** as the target hosting plan for a free personal project.
- **Yahoo Finance endpoints** via server-side fetches and API routes.
- **Zod** for validating local JSON data before the UI uses it.
- **TradingView Lightweight Charts** for financial-native chart rendering.
- **Plain CSS design tokens** for the current monochrome/amber visual system.

The previous Phoenix LiveView implementation is preserved in `archived/phoenix-liveview/` and on the Git branch `archived`.

## Running It

```sh
npm install
npm run dev
```

Then open `http://localhost:3000`.

## First Deploy

Import `main` into Vercel as a Next.js project, then set these production environment variables:

```sh
ADMIN_USERNAME
ADMIN_PASSWORD
JWT_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Upstash Redis is required on Vercel for persisted edits and production login rate limiting. Without it, production write paths fail closed by design.

Optional: set `BRANDFETCH_API_KEY` to enable Brandfetch Brand API as a structured brand-color fallback when public website detection fails. The app still deploys without it and returns honest neutral colors.

## Status

The Next.js/Vercel migration is complete and the app is ready for first Vercel deployment testing. The next planned feature work is structured research evidence scoring.
