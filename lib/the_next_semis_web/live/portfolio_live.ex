defmodule TheNextSemisWeb.PortfolioLive do
  use TheNextSemisWeb, :live_view

  alias TheNextSemis.{Portfolio, MarketData.Poller}

  @sort_columns %{
    "allocation_percent" => :allocation_percent,
    "day_change_percent" => :day_change_percent,
    "pnl_dollars" => :pnl_dollars,
    "pnl_percent" => :pnl_percent,
    "ticker" => :ticker
  }

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
     |> assign(page_title: "Portfolio", positions: positions, sort: {:allocation_percent, :desc})
     |> refresh(quotes)}
  end

  @impl true
  def handle_info({:quote_update, _ticker, _quote}, socket) do
    {:noreply, refresh(socket, Poller.all_quotes())}
  end

  @impl true
  def handle_event("sort", %{"col" => col_str}, socket) do
    case Map.fetch(@sort_columns, col_str) do
      {:ok, col} ->
        {cur_col, cur_dir} = socket.assigns.sort
        dir = if col == cur_col, do: flip(cur_dir), else: :desc
        sort = {col, dir}
        {:noreply, assign(socket, sort: sort, rows: sort_rows(socket.assigns.rows, sort))}

      :error ->
        {:noreply, socket}
    end
  end

  defp refresh(socket, quotes) do
    enriched = Portfolio.enrich_positions(socket.assigns.positions, quotes)
    summary = Portfolio.summary(enriched)
    rows = enriched |> with_allocation(summary.total_value) |> sort_rows(socket.assigns.sort)
    assign(socket, quotes: quotes, summary: summary, rows: rows)
  end

  defp with_allocation(enriched, total_value) do
    Enum.map(enriched, fn pos ->
      alloc =
        if total_value > 0,
          do: (pos["total_value"] || 0.0) / total_value * 100,
          else: 0.0

      Map.put(pos, "allocation_percent", alloc)
    end)
  end

  defp sort_rows(rows, {col, dir}) do
    key = Atom.to_string(col)

    Enum.sort_by(rows, &Map.get(&1, key), fn
      nil, nil -> true
      nil, _ -> false
      _, nil -> true
      a, b when dir == :asc -> a <= b
      a, b -> a >= b
    end)
  end

  defp flip(:asc), do: :desc
  defp flip(:desc), do: :asc

  @impl true
  def render(assigns) do
    ~H"""
    <div class="space-y-10 pt-4">
      <div class="flex items-end justify-between">
        <div>
          <p class="text-4xl font-semibold tabular-nums tracking-tight">
            {fmt_usd(@summary.total_value)}
          </p>
          <div class="mt-2 flex items-center gap-3 text-sm">
            <span class={"tabular-nums font-medium " <> sign_class(@summary.day_change_dollars)}>
              {fmt_signed_usd(@summary.day_change_dollars)}
            </span>
            <span class={"tabular-nums " <> sign_class(@summary.day_change_percent)}>
              {fmt_signed_pct(@summary.day_change_percent)} today
            </span>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="border-b border-[var(--color-grid)] text-xs text-[var(--color-neutral)]">
            <tr>
              <.th col="ticker" sort={@sort} label="Ticker" />
              <th class="px-4 py-3 text-left font-normal">Company</th>
              <th class="px-4 py-3 text-right font-normal">Shares</th>
              <th class="px-4 py-3 text-right font-normal">Avg Cost</th>
              <th class="px-4 py-3 text-right font-normal">Current</th>
              <.th col="pnl_dollars" sort={@sort} label="PnL $" align="right" />
              <.th col="pnl_percent" sort={@sort} label="PnL %" align="right" />
              <.th col="day_change_percent" sort={@sort} label="Day %" align="right" />
              <.th col="allocation_percent" sort={@sort} label="Alloc %" align="right" />
            </tr>
          </thead>
          <tbody>
            <tr
              :for={row <- @rows}
              class="border-b border-[var(--color-grid)] last:border-0 hover:bg-base-200 transition-colors"
            >
              <td class="px-4 py-3.5 font-semibold">{row["ticker"]}</td>
              <td class="px-4 py-3.5 text-[var(--color-neutral)]">{row["company"]}</td>
              <td class="px-4 py-3.5 text-right tabular-nums">{fmt_shares(row["shares"])}</td>
              <td class="px-4 py-3.5 text-right tabular-nums">{fmt_usd(row["average_cost"])}</td>
              <td class="px-4 py-3.5 text-right tabular-nums">{fmt_price(row["current_price"])}</td>
              <td class={"px-4 py-3.5 text-right tabular-nums font-medium " <> sign_class(row["pnl_dollars"])}>
                {fmt_signed_usd(row["pnl_dollars"])}
              </td>
              <td class={"px-4 py-3.5 text-right tabular-nums " <> sign_class(row["pnl_percent"])}>
                {fmt_signed_pct(row["pnl_percent"])}
              </td>
              <td class={"px-4 py-3.5 text-right tabular-nums " <> sign_class(row["day_change_percent"])}>
                {fmt_signed_pct(row["day_change_percent"])}
              </td>
              <td class="px-4 py-3.5 text-right tabular-nums text-[var(--color-neutral)]">
                {fmt_pct(row["allocation_percent"])}
              </td>
            </tr>
            <tr :if={@rows == []}>
              <td colspan="9" class="px-4 py-12 text-center text-[var(--color-neutral)]">
                No positions loaded — add <code>priv/data/positions.json</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    """
  end

  attr :col, :string, required: true
  attr :label, :string, required: true
  attr :sort, :any, required: true
  attr :align, :string, default: "left"

  defp th(assigns) do
    {cur_col, cur_dir} = assigns.sort
    active = Atom.to_string(cur_col) == assigns.col

    assigns =
      assign(assigns,
        active: active,
        arrow: if(active, do: if(cur_dir == :asc, do: "↑", else: "↓"), else: "")
      )

    ~H"""
    <th class={"px-4 py-3 text-#{@align} font-normal"}>
      <button
        phx-click="sort"
        phx-value-col={@col}
        class={"flex items-center gap-1 cursor-pointer hover:text-base-content " <> if @align == "right", do: "ml-auto", else: ""}
      >
        <span class={if @active, do: "text-[var(--color-accent)] font-medium", else: ""}>
          {@label}
        </span>
        <span class="text-[var(--color-accent)]">{@arrow}</span>
      </button>
    </th>
    """
  end

  defp fmt_usd(nil), do: "—"
  defp fmt_usd(n), do: "$" <> fmt_abs(n)

  defp fmt_price(nil), do: "—"
  defp fmt_price(n), do: "$" <> fmt_abs(n)

  defp fmt_shares(nil), do: "—"

  defp fmt_shares(n),
    do:
      :io_lib.format("~.4f", [n * 1.0])
      |> to_string()
      |> String.trim_trailing("0")
      |> String.trim_trailing(".")

  defp fmt_signed_usd(nil), do: "—"
  defp fmt_signed_usd(n) when n >= 0, do: "+$" <> fmt_abs(n)
  defp fmt_signed_usd(n), do: "-$" <> fmt_abs(-n)

  defp fmt_signed_pct(nil), do: "—"
  defp fmt_signed_pct(n) when n >= 0, do: "+" <> fmt_abs(n) <> "%"
  defp fmt_signed_pct(n), do: "-" <> fmt_abs(-n) <> "%"

  defp fmt_pct(nil), do: "—"
  defp fmt_pct(n), do: fmt_abs(n) <> "%"

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
