defmodule TheNextSemisWeb.TickerLive do
  use TheNextSemisWeb, :live_view

  alias TheNextSemis.Research
  alias TheNextSemis.MarketData.Client
  alias TheNextSemis.MarketData.Poller

  @impl true
  def mount(%{"ticker" => ticker}, _session, socket) do
    ticker = String.upcase(ticker)

    case find_entry(ticker) do
      nil ->
        {:ok, push_navigate(socket, to: ~p"/research")}

      entry ->
        if connected?(socket) do
          Phoenix.PubSub.subscribe(TheNextSemis.PubSub, Poller.topic())
        end

        quote = Poller.last_quote(ticker)
        history = fetch_history(ticker)

        {:ok,
         assign(socket,
           page_title: entry["company"],
           ticker: ticker,
           entry: entry,
           quote: quote,
           history_json: Jason.encode!(history)
         )}
    end
  end

  @impl true
  def handle_info({:quote_update, ticker, quote}, %{assigns: %{ticker: ticker}} = socket) do
    {:noreply, assign(socket, quote: quote)}
  end

  def handle_info({:quote_update, _ticker, _quote}, socket), do: {:noreply, socket}

  defp find_entry(ticker) do
    case Research.load_watchlist() do
      {:ok, entries} -> Enum.find(entries, &(&1["ticker"] == ticker))
      _ -> nil
    end
  end

  defp fetch_history(ticker) do
    case Client.history(ticker, "1mo") do
      {:ok, result} -> format_candles(result)
      _ -> []
    end
  end

  defp format_candles(%{"timestamp" => timestamps, "indicators" => %{"quote" => [ohlcv | _]}}) do
    opens = ohlcv["open"] || []
    highs = ohlcv["high"] || []
    lows = ohlcv["low"] || []
    closes = ohlcv["close"] || []

    [timestamps, opens, highs, lows, closes]
    |> Enum.zip()
    |> Enum.reject(fn {_t, o, h, l, c} -> is_nil(o) or is_nil(h) or is_nil(l) or is_nil(c) end)
    |> Enum.map(fn {t, o, h, l, c} -> %{time: t, open: o, high: h, low: l, close: c} end)
  end

  defp format_candles(_), do: []

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-8">
      <div class="flex items-start justify-between gap-4">
        <div>
          <a
            href="/research"
            class="text-xs text-[var(--color-neutral)] hover:text-base-content"
          >
            ← Research
          </a>
          <h1 class="mt-2 text-2xl font-semibold">
            {@ticker}
            <span class="ml-2 text-base font-normal text-base-content/60">{@entry["company"]}</span>
          </h1>
          <p class="mt-1 text-sm text-[var(--color-neutral)]">{@entry["theme"]}</p>
        </div>

        <div class="text-right">
          <p :if={@quote} class="text-3xl font-semibold tabular-nums">
            ${fmt_abs(@quote.price)}
          </p>
          <p
            :if={@quote}
            class={"tabular-nums text-sm font-medium " <> sign_class(@quote.regular_market_change_percent)}
          >
            {fmt_signed_pct(@quote.regular_market_change_percent)}
            <span class={sign_class(@quote.regular_market_change)}>
              ({fmt_signed_usd(@quote.regular_market_change)})
            </span>
          </p>
          <p :if={is_nil(@quote)} class="text-sm text-[var(--color-neutral)]">Awaiting quote…</p>
        </div>
      </div>

      <div
        id="price-chart"
        phx-hook="Chart"
        data-history={@history_json}
        class="w-full rounded-xl border border-[var(--color-grid)] overflow-hidden"
        style="height: 400px;"
      />

      <div class="grid gap-6 sm:grid-cols-2">
        <div class="rounded-xl border border-[var(--color-grid)] bg-base-200 p-5">
          <p class="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Status &amp; Conviction
          </p>
          <div class="flex items-center gap-3">
            <span class={"rounded-full px-3 py-1 text-sm font-medium " <> conviction_class(@entry["conviction"])}>
              {@entry["conviction"]}
            </span>
            <span class={"rounded-full px-3 py-1 text-sm " <> status_class(@entry["status"])}>
              {@entry["status"]}
            </span>
          </div>
        </div>

        <div class="rounded-xl border border-[var(--color-grid)] bg-base-200 p-5">
          <p class="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Entry Conditions
          </p>
          <ul class="space-y-2">
            <li
              :for={cond <- @entry["conditions"] || []}
              class="flex items-start gap-2 text-sm"
            >
              <span class="mt-1 text-[var(--color-neutral)]">·</span>
              {cond}
            </li>
          </ul>
        </div>
      </div>
    </div>
    """
  end

  defp conviction_class("high"), do: "bg-[var(--color-gain)]/15 text-[var(--color-gain)]"
  defp conviction_class("medium"), do: "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
  defp conviction_class(_), do: "bg-base-300 text-[var(--color-neutral)]"

  defp status_class("triggered"), do: "bg-[var(--color-gain)]/15 text-[var(--color-gain)]"
  defp status_class("invalidated"), do: "bg-[var(--color-loss)]/15 text-[var(--color-loss)]"
  defp status_class(_), do: "bg-base-300 text-[var(--color-neutral)]"

  defp fmt_abs(nil), do: "—"

  defp fmt_abs(n) do
    [int_part, dec_part] =
      :io_lib.format("~.2f", [abs(n) * 1.0]) |> to_string() |> String.split(".")

    int_with_commas =
      int_part
      |> String.graphemes()
      |> Enum.reverse()
      |> Enum.chunk_every(3)
      |> Enum.map_join(",", &Enum.join/1)
      |> String.reverse()

    int_with_commas <> "." <> dec_part
  end

  defp fmt_signed_usd(nil), do: "—"
  defp fmt_signed_usd(n) when n >= 0, do: "+$" <> fmt_abs(n)
  defp fmt_signed_usd(n), do: "-$" <> fmt_abs(-n)

  defp fmt_signed_pct(nil), do: "—"
  defp fmt_signed_pct(n) when n >= 0, do: "+" <> fmt_abs(n) <> "%"
  defp fmt_signed_pct(n), do: "-" <> fmt_abs(-n) <> "%"

  defp sign_class(nil), do: "text-[var(--color-neutral)]"
  defp sign_class(n) when n > 0, do: "text-[var(--color-gain)]"
  defp sign_class(n) when n < 0, do: "text-[var(--color-loss)]"
  defp sign_class(_), do: "text-[var(--color-neutral)]"
end
