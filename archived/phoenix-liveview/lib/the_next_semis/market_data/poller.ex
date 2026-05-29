defmodule TheNextSemis.MarketData.Poller do
  use GenServer
  require Logger

  alias TheNextSemis.{Portfolio, Research}
  alias TheNextSemis.MarketData.{Client, Quote}

  @poll_interval :timer.seconds(60)
  @topic "quotes"

  # --- Public API ---

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  def last_quote(ticker) do
    with_poller(fn -> GenServer.call(__MODULE__, {:last_quote, ticker}) end, nil)
  end

  def all_quotes do
    with_poller(fn -> GenServer.call(__MODULE__, :all_quotes) end, %{})
  end

  defp with_poller(fun, default) do
    case Process.whereis(__MODULE__) do
      nil -> default
      _pid -> fun.()
    end
  end

  def topic, do: @topic

  # --- GenServer callbacks ---

  @impl true
  def init(_opts) do
    tickers = load_tickers()
    Logger.info("[Poller] tracking #{length(tickers)} tickers: #{Enum.join(tickers, ", ")}")
    send(self(), :poll)
    {:ok, %{tickers: tickers, last_quotes: %{}}}
  end

  @impl true
  def handle_info(:poll, state) do
    new_quotes = fetch_and_validate(state.tickers, state.last_quotes)
    broadcast_changes(new_quotes, state.last_quotes)
    schedule_poll()
    {:noreply, %{state | last_quotes: new_quotes}}
  end

  @impl true
  def handle_call({:last_quote, ticker}, _from, state) do
    {:reply, Map.get(state.last_quotes, ticker), state}
  end

  @impl true
  def handle_call(:all_quotes, _from, state) do
    {:reply, state.last_quotes, state}
  end

  # --- Helpers ---

  defp load_tickers do
    positions = load_records(:positions, &Portfolio.load_positions/0)
    watchlist = load_records(:watchlist, &Research.load_watchlist/0)

    (Enum.map(positions, & &1["ticker"]) ++ Enum.map(watchlist, & &1["ticker"]))
    |> Enum.reject(&is_nil/1)
    |> Enum.uniq()
  end

  defp load_records(kind, loader) do
    case loader.() do
      {:ok, records} ->
        records

      {:error, reason} ->
        Logger.error("[Poller] failed to load #{kind}: #{inspect(reason)}")
        []
    end
  end

  defp fetch_and_validate([], last_quotes), do: last_quotes

  defp fetch_and_validate(tickers, last_quotes) do
    case Client.quotes(tickers) do
      {:ok, results} ->
        Enum.reduce(results, last_quotes, fn raw, acc ->
          case Quote.from_yahoo(raw) do
            {:ok, quote} ->
              Map.put(acc, quote.ticker, quote)

            {:error, cs} ->
              Logger.warning("[Poller] invalid quote for #{raw["symbol"]}: #{inspect(cs.errors)}")
              acc
          end
        end)

      {:error, reason} ->
        Logger.error("[Poller] Yahoo fetch failed: #{inspect(reason)}; keeping last-known state")
        last_quotes
    end
  end

  defp broadcast_changes(new_quotes, last_quotes) do
    Enum.each(new_quotes, fn {ticker, quote} ->
      if Map.get(last_quotes, ticker) != quote do
        Phoenix.PubSub.broadcast(
          TheNextSemis.PubSub,
          @topic,
          {:quote_update, ticker, quote}
        )
      end
    end)
  end

  defp schedule_poll do
    Process.send_after(self(), :poll, @poll_interval)
  end
end
