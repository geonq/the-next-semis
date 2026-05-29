defmodule TheNextSemis.MarketData.Client do
  @base "https://query1.finance.yahoo.com"

  @doc """
  Fetch current quotes for a list of ticker symbols.
  Returns `{:ok, [raw_result_map, ...]}` or `{:error, reason}`.
  """
  def quotes(tickers) when is_list(tickers) and tickers != [] do
    symbols = Enum.join(tickers, ",")

    case Req.get("#{@base}/v7/finance/quote",
           params: [
             symbols: symbols,
             fields:
               "regularMarketPrice,currency,regularMarketChange,regularMarketChangePercent,regularMarketTime"
           ],
           headers: [{"user-agent", "Mozilla/5.0"}],
           receive_timeout: 10_000
         ) do
      {:ok, %{status: 200, body: body}} ->
        parse_quote_response(body)

      {:ok, %{status: status}} when status in [401, 403] ->
        chart_quotes(tickers)

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  @doc """
  Fetch OHLCV history for a single ticker.
  `range` is one of: "1d", "5d", "1mo", "6mo", "1y", "5y".
  Returns `{:ok, body_map}` or `{:error, reason}`.
  """
  def history(ticker, range \\ "1mo") do
    interval = interval_for(range)

    case Req.get("#{@base}/v8/finance/chart/#{URI.encode(ticker)}",
           params: [range: range, interval: interval],
           headers: [{"user-agent", "Mozilla/5.0"}],
           receive_timeout: 10_000
         ) do
      {:ok, %{status: 200, body: body}} ->
        parse_chart_response(body)

      {:ok, %{status: status}} ->
        {:error, {:http_error, status}}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp parse_quote_response(%{"quoteResponse" => %{"result" => results}})
       when is_list(results),
       do: {:ok, results}

  defp parse_quote_response(body),
    do: {:error, {:unexpected_response, body}}

  defp parse_chart_response(%{"chart" => %{"result" => [result | _]}}),
    do: {:ok, result}

  defp parse_chart_response(body),
    do: {:error, {:unexpected_response, body}}

  defp chart_quotes(tickers) do
    {quotes, errors} =
      Enum.reduce(tickers, {[], []}, fn ticker, {quotes, errors} ->
        case chart_quote(ticker) do
          {:ok, quote} -> {[quote | quotes], errors}
          {:error, reason} -> {quotes, [{ticker, reason} | errors]}
        end
      end)

    case {quotes, errors} do
      {[], errors} -> {:error, {:chart_quote_failed, Enum.reverse(errors)}}
      {quotes, _errors} -> {:ok, Enum.reverse(quotes)}
    end
  end

  defp chart_quote(ticker) do
    with {:ok, %{"meta" => meta}} <- history(ticker, "1d") do
      {:ok, quote_attrs_from_chart_meta(meta)}
    end
  end

  defp quote_attrs_from_chart_meta(meta) do
    price = meta["regularMarketPrice"]
    previous_close = meta["previousClose"] || meta["chartPreviousClose"]
    change = change(price, previous_close)

    %{
      "symbol" => meta["symbol"],
      "regularMarketPrice" => price,
      "currency" => meta["currency"],
      "regularMarketChange" => change,
      "regularMarketChangePercent" => change_percent(change, previous_close),
      "regularMarketTime" => meta["regularMarketTime"]
    }
  end

  defp change(price, previous_close) when is_number(price) and is_number(previous_close) do
    price - previous_close
  end

  defp change(_price, _previous_close), do: nil

  defp change_percent(change, previous_close)
       when is_number(change) and is_number(previous_close) and previous_close != 0 do
    change / previous_close * 100
  end

  defp change_percent(_change, _previous_close), do: nil

  defp interval_for("1d"), do: "5m"
  defp interval_for("5d"), do: "15m"
  defp interval_for(_), do: "1d"
end
