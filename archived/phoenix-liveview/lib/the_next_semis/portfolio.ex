defmodule TheNextSemis.Portfolio do
  @moduledoc false

  alias TheNextSemis.MarketData.Quote
  alias TheNextSemis.Portfolio.Position

  def load_positions do
    data_dir = data_dir()
    real = Path.join(data_dir, "positions.json")
    fallback = Path.join(data_dir, "positions.example.json")
    path = if File.exists?(real), do: real, else: fallback

    path
    |> load_json_collection()
    |> validate_records(&Position.from_json/1)
  end

  @doc """
  Merge a list of raw position maps with a quotes map and compute PnL.
  Returns a list of enriched position maps.
  """
  def enrich_positions(positions, quotes) when is_list(positions) and is_map(quotes) do
    Enum.map(positions, fn pos ->
      ticker = pos["ticker"]
      shares = pos["shares"] || 0
      avg_cost = pos["average_cost"] || 0

      case Map.get(quotes, ticker) do
        %Quote{price: price} = quote ->
          total_value = shares * price
          pnl_dollars = shares * (price - avg_cost)
          pnl_percent = if avg_cost > 0, do: (price - avg_cost) / avg_cost * 100, else: 0.0

          Map.merge(pos, %{
            "current_price" => price,
            "total_value" => total_value,
            "pnl_dollars" => pnl_dollars,
            "pnl_percent" => pnl_percent,
            "day_change" => quote.regular_market_change,
            "day_change_percent" => quote.regular_market_change_percent
          })

        nil ->
          Map.merge(pos, %{"quote_status" => :no_data})
      end
    end)
  end

  @doc """
  Compute a portfolio summary from enriched positions.
  Returns a map with total_value, day_change_dollars, day_change_percent.
  """
  def summary(enriched_positions) do
    positions_with_data =
      Enum.filter(enriched_positions, &Map.has_key?(&1, "total_value"))

    total_value = Enum.reduce(positions_with_data, 0.0, &(&1["total_value"] + &2))

    day_change_dollars =
      Enum.reduce(positions_with_data, 0.0, fn pos, acc ->
        shares = pos["shares"] || 0
        day_change = pos["day_change"] || 0.0
        acc + shares * day_change
      end)

    day_change_percent =
      if total_value > 0,
        do: day_change_dollars / (total_value - day_change_dollars) * 100,
        else: 0.0

    %{
      total_value: total_value,
      day_change_dollars: day_change_dollars,
      day_change_percent: day_change_percent
    }
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
