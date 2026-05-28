# The Next Semis

A live portfolio and research dashboard built around one question: **where is the next AI-scale industry boom forming, and can I get there before the consensus does?**

"The next semis" is a frame, not a target. The semiconductor boom of the 2010s–2020s is the historical anchor — but the hunt is for whatever comes next. AI infrastructure has already been priced in. The interesting question is what compounds on top of it: power, memory, robotics, biotech compute, novel materials, or something nobody is talking about yet.

## What it does

- **Live portfolio.** Current positions with real-time PnL, cost basis, and allocation. Quotes are pulled from Yahoo Finance, validated, and displayed honestly — if data is missing, the UI says so. No invented numbers.
- **Research watchlist.** Companies grouped by thesis. Each ticker carries a written conviction, the catalysts that would confirm it, and the conditions that would invalidate it.
- **Ticker deep-dives.** Per-ticker pages with price history, the active thesis, kill switches, and notes accumulated over time.

## How it's built

- **Phoenix LiveView** (Elixir) — the UI is server-rendered and streams updates over a persistent WebSocket. New quotes appear without a refresh, without client-side polling, without a state-management library.
- **OTP supervision** — if the data source flakes, the polling process restarts on its own and the UI keeps serving last-known-good data instead of crashing. Self-healing as a default, not a feature flag.
- **TradingView Lightweight Charts** — the charting library used by trading desks. Tiny bundle, financial-native primitives (candlesticks, volume, multi-pane).
- **Tailwind CSS v4** — design tokens in plain CSS variables, dark by default.
- **Fly.io** — deployed multi-region, persistent connections, no platform middleware between the app and its socket.

## Running it

Requires Elixir 1.17+ and Erlang/OTP 27+. Install via [asdf](https://asdf-vm.com) or your package manager.

```sh
mix deps.get
mix phx.server
```

Then open `http://localhost:4000`.

## Status

In active development. Portfolio view and research surfaces ship first; ticker deep-dives and the Fly deploy follow. Positions and watchlist live in `priv/data/` as static JSON until there's a reason for a database.

## Why this exists

Spreadsheets are how most retail investors track positions. I wanted something I could actually live inside — fast to scan, honest about what it knows, and built on a stack I'd want to extend. Open-source on purpose, because the thinking is more useful in public than in a private repo.
