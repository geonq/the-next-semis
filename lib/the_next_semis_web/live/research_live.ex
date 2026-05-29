defmodule TheNextSemisWeb.ResearchLive do
  use TheNextSemisWeb, :live_view

  alias TheNextSemis.{Research, MarketData.Poller}

  @impl true
  def mount(_params, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(TheNextSemis.PubSub, Poller.topic())
    end

    entries =
      case Research.load_watchlist() do
        {:ok, es} -> es
        _ -> []
      end

    quotes = Poller.all_quotes()
    enriched = Research.enrich_watchlist(entries, quotes)

    themes =
      entries |> Enum.map(& &1["theme"]) |> Enum.reject(&is_nil/1) |> Enum.uniq() |> Enum.sort()

    convictions =
      entries
      |> Enum.map(& &1["conviction"])
      |> Enum.reject(&is_nil/1)
      |> Enum.uniq()
      |> Enum.sort()

    thesis_html =
      case File.read(thesis_path()) do
        {:ok, md} -> md |> Earmark.as_html!() |> Phoenix.HTML.raw()
        _ -> Phoenix.HTML.raw("<p>Thesis not found.</p>")
      end

    {:ok,
     assign(socket,
       page_title: "Research",
       entries: enriched,
       themes: themes,
       convictions: convictions,
       active_themes: MapSet.new(),
       active_convictions: MapSet.new(),
       thesis_html: thesis_html
     )}
  end

  @impl true
  def handle_info({:quote_update, _ticker, _quote}, socket) do
    quotes = Poller.all_quotes()

    raw_entries =
      case Research.load_watchlist() do
        {:ok, es} -> es
        _ -> []
      end

    enriched = Research.enrich_watchlist(raw_entries, quotes)
    {:noreply, assign(socket, entries: enriched)}
  end

  @impl true
  def handle_event("toggle_theme", %{"theme" => theme}, socket) do
    active = toggle(socket.assigns.active_themes, theme)
    {:noreply, assign(socket, active_themes: active)}
  end

  @impl true
  def handle_event("toggle_conviction", %{"conviction" => conviction}, socket) do
    active = toggle(socket.assigns.active_convictions, conviction)
    {:noreply, assign(socket, active_convictions: active)}
  end

  defp toggle(set, value) do
    if MapSet.member?(set, value), do: MapSet.delete(set, value), else: MapSet.put(set, value)
  end

  defp filtered(entries, active_themes, active_convictions) do
    entries
    |> maybe_filter(active_themes, & &1["theme"])
    |> maybe_filter(active_convictions, & &1["conviction"])
  end

  defp maybe_filter(entries, set, key_fn) do
    if MapSet.size(set) == 0,
      do: entries,
      else: Enum.filter(entries, &MapSet.member?(set, key_fn.(&1)))
  end

  defp thesis_path do
    data_dir =
      Application.get_env(:the_next_semis, :data_dir) ||
        Application.app_dir(:the_next_semis, "priv/data")

    Path.join(data_dir, "thesis.md")
  end

  @impl true
  def render(assigns) do
    assigns =
      assign(
        assigns,
        :visible,
        filtered(assigns.entries, assigns.active_themes, assigns.active_convictions)
      )

    ~H"""
    <div class="space-y-10">
      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Theme
          </span>
          <button
            :for={theme <- @themes}
            phx-click="toggle_theme"
            phx-value-theme={theme}
            class={"rounded-full border px-3 py-1 text-xs transition-colors " <> chip_class(MapSet.member?(@active_themes, theme))}
          >
            {theme}
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
            Conviction
          </span>
          <button
            :for={conv <- @convictions}
            phx-click="toggle_conviction"
            phx-value-conviction={conv}
            class={"rounded-full border px-3 py-1 text-xs transition-colors " <> chip_class(MapSet.member?(@active_convictions, conv))}
          >
            {conv}
          </button>
        </div>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <a
          :for={entry <- @visible}
          href={"/research/#{entry["ticker"]}"}
          class="group rounded-xl border border-[var(--color-grid)] bg-base-200 p-5 transition-colors hover:border-[var(--color-accent)]/50 hover:bg-base-300"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-semibold">{entry["ticker"]}</p>
              <p class="text-sm text-base-content/60">{entry["company"]}</p>
            </div>
            <div class="flex flex-col items-end gap-1">
              <span class={"rounded-full px-2 py-0.5 text-xs font-medium " <> conviction_class(entry["conviction"])}>
                {entry["conviction"]}
              </span>
              <span class={"rounded-full px-2 py-0.5 text-xs " <> status_class(entry["status"])}>
                {entry["status"]}
              </span>
            </div>
          </div>

          <p class="mt-3 text-xs text-[var(--color-neutral)]">{entry["theme"]}</p>

          <ul class="mt-3 space-y-1">
            <li
              :for={cond <- entry["conditions"] || []}
              class="flex items-start gap-2 text-xs text-base-content/70"
            >
              <span class="mt-0.5 text-[var(--color-neutral)]">·</span>
              {cond}
            </li>
          </ul>

          <div :if={Map.has_key?(entry, "current_price")} class="mt-4 flex items-center gap-3 text-sm">
            <span class="tabular-nums font-medium">${entry["current_price"] |> fmt_abs()}</span>
            <span class={"tabular-nums text-xs " <> sign_class(entry["day_change_percent"])}>
              {fmt_signed_pct(entry["day_change_percent"])}
            </span>
          </div>
        </a>

        <p :if={@visible == []} class="col-span-full text-sm text-[var(--color-neutral)]">
          No entries match the active filters.
        </p>
      </div>

      <section class="border-t border-[var(--color-grid)] pt-8">
        <p class="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--color-neutral)]">
          Thesis
        </p>
        <div class="prose prose-invert prose-sm max-w-3xl text-base-content/80">
          {@thesis_html}
        </div>
      </section>
    </div>
    """
  end

  defp chip_class(true),
    do: "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"

  defp chip_class(false),
    do: "border-[var(--color-grid)] text-base-content/60 hover:border-[var(--color-neutral)]"

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

  defp fmt_signed_pct(nil), do: "—"
  defp fmt_signed_pct(n) when n >= 0, do: "+" <> fmt_abs(n) <> "%"
  defp fmt_signed_pct(n), do: "-" <> fmt_abs(-n) <> "%"

  defp sign_class(nil), do: "text-[var(--color-neutral)]"
  defp sign_class(n) when n > 0, do: "text-[var(--color-gain)]"
  defp sign_class(n) when n < 0, do: "text-[var(--color-loss)]"
  defp sign_class(_), do: "text-[var(--color-neutral)]"
end
