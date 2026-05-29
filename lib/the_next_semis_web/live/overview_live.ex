defmodule TheNextSemisWeb.OverviewLive do
  use TheNextSemisWeb, :live_view

  alias TheNextSemis.{Portfolio, MarketData.Poller}

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(TheNextSemis.PubSub, Poller.topic())
    end

    positions =
      case Portfolio.load_positions() do
        {:ok, ps} -> ps
        _ -> []
      end

    quotes = Poller.all_quotes()

    {:ok,
     socket
     |> assign(page_title: "Overview", positions: positions)
     |> refresh(quotes)}
  end

  @impl true
  def handle_info({:quote_update, _ticker, _quote}, socket) do
    {:noreply, refresh(socket, Poller.all_quotes())}
  end

  defp refresh(socket, quotes) do
    enriched = Portfolio.enrich_positions(socket.assigns.positions, quotes)
    summary = Portfolio.summary(enriched)

    assign(socket,
      quotes: quotes,
      summary: summary,
      top_gainers: movers(enriched, :desc),
      top_losers: movers(enriched, :asc)
    )
  end

  defp movers(enriched, dir) do
    enriched
    |> Enum.filter(&is_number(&1["day_change_percent"]))
    |> Enum.sort_by(& &1["day_change_percent"], dir)
    |> Enum.take(3)
  end

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-8">
      <div class="rounded-xl border border-[var(--color-grid)] bg-base-200 p-6">
        <p class="text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
          Total Portfolio Value
        </p>
        <p class="mt-2 text-4xl font-semibold tabular-nums">{fmt_usd(@summary.total_value)}</p>
        <div class="mt-3 flex items-center gap-4 text-sm">
          <span class={"font-medium tabular-nums " <> sign_class(@summary.day_change_dollars)}>
            {fmt_signed_usd(@summary.day_change_dollars)}
          </span>
          <span class={"font-medium tabular-nums " <> sign_class(@summary.day_change_percent)}>
            {fmt_signed_pct(@summary.day_change_percent)}
          </span>
          <span class="text-[var(--color-neutral)]">today</span>
        </div>
      </div>

      <div class="grid gap-6 sm:grid-cols-2">
        <div>
          <p class="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Top Gainers
          </p>
          <div class="space-y-2">
            <div
              :for={pos <- @top_gainers}
              class="flex items-center justify-between rounded-lg border border-[var(--color-grid)] bg-base-200 px-4 py-3"
            >
              <div>
                <span class="font-semibold">{pos["ticker"]}</span>
                <span class="ml-2 text-sm text-base-content/50">{pos["company"]}</span>
              </div>
              <span class="tabular-nums font-semibold text-[var(--color-gain)]">
                {fmt_signed_pct(pos["day_change_percent"])}
              </span>
            </div>
            <p :if={@top_gainers == []} class="text-sm text-[var(--color-neutral)]">
              Awaiting market data…
            </p>
          </div>
        </div>

        <div>
          <p class="mb-3 text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Top Losers
          </p>
          <div class="space-y-2">
            <div
              :for={pos <- @top_losers}
              class="flex items-center justify-between rounded-lg border border-[var(--color-grid)] bg-base-200 px-4 py-3"
            >
              <div>
                <span class="font-semibold">{pos["ticker"]}</span>
                <span class="ml-2 text-sm text-base-content/50">{pos["company"]}</span>
              </div>
              <span class="tabular-nums font-semibold text-[var(--color-loss)]">
                {fmt_signed_pct(pos["day_change_percent"])}
              </span>
            </div>
            <p :if={@top_losers == []} class="text-sm text-[var(--color-neutral)]">
              Awaiting market data…
            </p>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp fmt_usd(nil), do: "—"
  defp fmt_usd(n), do: "$" <> fmt_abs(n)

  defp fmt_signed_usd(nil), do: "—"
  defp fmt_signed_usd(n) when n >= 0, do: "+$" <> fmt_abs(n)
  defp fmt_signed_usd(n), do: "-$" <> fmt_abs(-n)

  defp fmt_signed_pct(nil), do: "—"
  defp fmt_signed_pct(n) when n >= 0, do: "+" <> fmt_abs(n) <> "%"
  defp fmt_signed_pct(n), do: "-" <> fmt_abs(-n) <> "%"

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

  defp sign_class(nil), do: "text-[var(--color-neutral)]"
  defp sign_class(n) when n > 0, do: "text-[var(--color-gain)]"
  defp sign_class(n) when n < 0, do: "text-[var(--color-loss)]"
  defp sign_class(_), do: "text-[var(--color-neutral)]"
end
