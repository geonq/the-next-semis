# Architecture

The active app is a Next.js App Router project intended for Vercel Hobby.

## Runtime Shape

```text
Browser
  |
  | initial page render
  v
Next.js server components
  |
  | load local JSON + fetch Yahoo quote/history data
  v
Rendered dashboard
  |
  | client polling every 60s
  v
/api/quotes -> Yahoo Finance
```

## Data

- `data/positions.json` — current portfolio seed data
- `data/watchlist.json` — research watchlist seed data
- `data/thesis.md` — thesis prose rendered on `/research`

All JSON is parsed through Zod schemas in `lib/data.ts`.

## Market Data

`lib/market.ts` fetches current quotes and chart history from Yahoo Finance. It mirrors the old Phoenix behavior:

- try Yahoo quote endpoint first
- fall back to chart metadata when quote access is rejected
- return empty data rather than inventing numbers

## UI Routes

- `/` — overview summary and top movers
- `/portfolio` — holdings table
- `/research` — filters, watchlist cards, thesis prose
- `/research/[ticker]` — ticker quote, candlestick chart, status, entry conditions

## Archive

The previous Phoenix LiveView app is preserved in two places:

- `archived/phoenix-liveview/`
- Git branch `archived`

Do not continue Fly.io work unless explicitly re-approved.
