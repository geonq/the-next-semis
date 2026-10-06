# The Next Semis

An Edge-native portfolio and research dashboard deployed on Cloudflare Workers, built around one question: **where is the next AI-scale industry boom forming, and can I get there before the consensus does?**

"The next semis" is a frame, not a target. The semiconductor boom of the 2010s–2020s is the historical anchor, but the hunt is for whatever comes next: power, memory, robotics, biotech compute, novel materials, or another physical constraint that is still underpriced.

**Live Production URLs:**
- Primary: [https://thenextsemis.geonq.de](https://thenextsemis.geonq.de)
- Worker Direct: [https://the-next-semis.domkegeorg2017.workers.dev](https://the-next-semis.domkegeorg2017.workers.dev)

**Status: Shipped & Live on Cloudflare Edge (100% Free Forever Tier).**

## What It Does

- **Portfolio overview.** Current positions with live quote refresh, day movers, cost basis, and PnL.
- **Sector allocation.** Bar chart on the portfolio page showing capital distribution by sector and watchlist theme coverage (watching vs. actually holding).
- **Research watchlist.** Companies grouped by theme, conviction, and status — with entry conditions and a buy trigger field ("what would make me pull the trigger").
- **Ticker deep-dives.** Per-ticker pages with live quote, price chart, entry conditions, buy trigger, reading list, news feed, and research docs.
- **Reading list.** Saved articles and papers scoped to tickers or themes.
- **Research docs.** Persisted markdown and notes accessible on the research page.

## Stack & Architecture

- **Next.js 15 (App Router) + TypeScript** — modern React Server Components and edge-optimized API routes.
- **Cloudflare Workers (via OpenNext)** — edge runtime target (`@opennextjs/cloudflare` + `wrangler.jsonc`), 100% free tier, zero Vercel dependencies.
- **Yahoo Finance, CoinGecko & Bitstamp** — real-time quotes, history, and perpetual mark pricing via server-side fetches.
- **Upstash Redis** — globally distributed key-value store for persisted writes (watchlist edits, reading list, research docs, rate limiting). Local JSON fallback for dev.
- **Zod** — strict schema validation before the UI or backend touches any payload.
- **TradingView Lightweight Charts** — high-performance financial chart rendering with monochrome liquid-glass design tokens.

## Running Locally

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Admin features require the env vars below.

## Production Build & Edge Deployment

Build and deploy to Cloudflare Workers:

```sh
npm run build:worker
npx wrangler deploy
```

## Environment Variables

Required in production:

```
ADMIN_USERNAME
ADMIN_PASSWORD
JWT_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Upstash Redis is required for persistent edge mutations. Without it, write paths fail closed by design.

Optional:

```
BRANDFETCH_API_KEY   # vendor fallback for brand colors when public detection fails
```
