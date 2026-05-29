# Architecture

Phoenix LiveView dashboard with two surfaces (portfolio + research) and no database.

## Process tree

```
TheNextSemis.Application (root supervisor)
├── Phoenix.PubSub (TheNextSemis.PubSub)
├── TheNextSemisWeb.Endpoint
└── TheNextSemis.MarketData.Poller (GenServer)
    └── periodic Req calls to Yahoo Finance
```

The Poller is the only process that talks to the outside world. It loads positions + watchlist from `priv/data/` at boot, polls Yahoo every 60 seconds, validates each response via an Ecto changeset, and broadcasts `{:quote_update, ticker, quote}` on the `"quotes"` PubSub topic. LiveViews subscribe on mount and re-render the affected assigns when a message arrives.

If Yahoo returns garbage or the request errors, the changeset rejects it and the Poller keeps its last-known-good state. If the Poller process itself crashes, the supervisor restarts it. LiveViews never crash because of an upstream data problem — they render `:no_data` when there's nothing to show.

## Routes

| Path | LiveView | Purpose |
|---|---|---|
| `/` | `OverviewLive` | Portfolio summary, top movers, thesis alerts |
| `/portfolio` | `PortfolioLive` | Full holdings table with live PnL |
| `/research` | `ResearchLive` | Watchlist cards grouped by thesis |
| `/research/:ticker` | `TickerLive` | Per-ticker deep dive with chart |

## Folder layout (post-scaffold)

```
lib/
├── the_next_semis/
│   ├── application.ex
│   ├── market_data/
│   │   ├── client.ex          # Req wrapper for Yahoo
│   │   ├── poller.ex          # GenServer, periodic fetch + broadcast
│   │   └── quote.ex           # Ecto changeset (validation only, no DB)
│   ├── portfolio.ex           # context: positions, PnL calc
│   └── research.ex            # context: watchlist
└── the_next_semis_web/
    ├── components/
    ├── live/
    │   ├── overview_live.ex
    │   ├── portfolio_live.ex
    │   ├── research_live.ex
    │   └── ticker_live.ex
    ├── endpoint.ex
    └── router.ex

priv/
├── priv/
│   └── data/                  # static JSON + thesis.md
└── static/

assets/
├── css/app.css                # Tailwind v4 + design tokens
└── js/
    ├── app.js
    └── hooks/
        └── chart.js           # TradingView Lightweight Charts mount
```

## Data flow per quote update

1. Poller fires its 60s tick.
2. Poller calls `Client.quotes/1` for all tracked tickers (one batched HTTP call).
3. Response is validated with `Quote.changeset/2`. Invalid entries are dropped + logged.
4. Poller updates its internal `last_quotes` map.
5. Poller broadcasts `{:quote_update, ticker, quote}` on the `"quotes"` PubSub topic for each updated ticker.
6. Every mounted LiveView that called `Phoenix.PubSub.subscribe(TheNextSemis.PubSub, "quotes")` receives the message in `handle_info/2`.
7. The LiveView updates the relevant assign; Phoenix diffs the rendered template; only the changed nodes stream to the client over the WebSocket.

No client-side polling. No JSON-over-REST. No state-management library. The diff is the payload.

## Why no database

Positions and watchlist data are write-rarely, read-often, and small. JSON in `priv/data/` is simpler than schema migrations and survives every deploy without setup. When a real persistence need shows up (historical PnL snapshots, multi-user, audit log), Ecto + Postgres land in one phase — not before.
