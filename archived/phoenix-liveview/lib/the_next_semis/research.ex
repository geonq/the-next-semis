defmodule TheNextSemis.Research do
  @moduledoc false

  alias TheNextSemis.MarketData.Quote
  alias TheNextSemis.Research.WatchlistEntry

  def load_watchlist do
    data_dir = data_dir()
    real = Path.join(data_dir, "watchlist.json")
    fallback = Path.join(data_dir, "watchlist.example.json")
    path = if File.exists?(real), do: real, else: fallback

    path
    |> load_json_collection()
    |> validate_records(&WatchlistEntry.from_json/1)
  end

  @doc """
  Merge watchlist entries with latest quote data.
  """
  def enrich_watchlist(watchlist, quotes) when is_list(watchlist) and is_map(quotes) do
    Enum.map(watchlist, fn entry ->
      ticker = entry["ticker"]

      case Map.get(quotes, ticker) do
        %Quote{price: price} = quote ->
          Map.merge(entry, %{
            "current_price" => price,
            "day_change" => quote.regular_market_change,
            "day_change_percent" => quote.regular_market_change_percent
          })

        nil ->
          Map.merge(entry, %{"quote_status" => :no_data})
      end
    end)
  end

  defp data_dir do
    Application.get_env(:the_next_semis, :data_dir) ||
      Application.app_dir(:the_next_semis, "priv/data")
  end

  defp load_json_collection(path) do
    with {:ok, contents} <- File.read(path),
         {:ok, data} <- Jason.decode(contents),
         true <- is_list(data) do
      {:ok, {path, data}}
    else
      {:error, %Jason.DecodeError{} = error} -> {:error, {:invalid_json, path, error}}
      {:error, reason} -> {:error, {:read_failed, path, reason}}
      false -> {:error, {:invalid_json_shape, path, :not_a_list}}
    end
  end

  defp validate_records({:ok, {path, records}}, validator) do
    records
    |> Enum.with_index()
    |> Enum.reduce({[], []}, fn {record, index}, {valid, invalid} ->
      case validator.(record) do
        {:ok, normalized} -> {[normalized | valid], invalid}
        {:error, reason} -> {valid, [{index, reason} | invalid]}
      end
    end)
    |> case do
      {valid, []} -> {:ok, Enum.reverse(valid)}
      {_valid, invalid} -> {:error, {:invalid_records, path, Enum.reverse(invalid)}}
    end
  end

  defp validate_records({:error, reason}, _validator), do: {:error, reason}
end
