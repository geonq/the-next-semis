defmodule TheNextSemis.MarketData.QuoteTest do
  use ExUnit.Case, async: true

  alias TheNextSemis.MarketData.Quote

  @valid_raw %{
    "symbol" => "NVDA",
    "regularMarketPrice" => 135.42,
    "currency" => "USD",
    "regularMarketChange" => 2.15,
    "regularMarketChangePercent" => 1.61,
    "regularMarketTime" => 1_716_900_000
  }

  test "valid Yahoo response produces a Quote" do
    assert {:ok, %Quote{ticker: "NVDA", price: 135.42, currency: "USD"}} =
             Quote.from_yahoo(@valid_raw)
  end

  test "missing price is rejected" do
    raw = Map.delete(@valid_raw, "regularMarketPrice")
    assert {:error, cs} = Quote.from_yahoo(raw)
    assert {:price, _} = hd(cs.errors)
  end

  test "zero price is rejected" do
    raw = Map.put(@valid_raw, "regularMarketPrice", 0)
    assert {:error, cs} = Quote.from_yahoo(raw)
    assert {:price, _} = hd(cs.errors)
  end

  test "negative price is rejected" do
    raw = Map.put(@valid_raw, "regularMarketPrice", -1.0)
    assert {:error, cs} = Quote.from_yahoo(raw)
    assert {:price, _} = hd(cs.errors)
  end

  test "missing currency is rejected" do
    raw = Map.delete(@valid_raw, "currency")
    assert {:error, cs} = Quote.from_yahoo(raw)
    assert {:currency, _} = hd(cs.errors)
  end

  test "missing symbol is rejected" do
    raw = Map.delete(@valid_raw, "symbol")
    assert {:error, cs} = Quote.from_yahoo(raw)
    assert {:ticker, _} = hd(cs.errors)
  end

  test "optional fields may be nil" do
    raw =
      @valid_raw
      |> Map.delete("regularMarketChange")
      |> Map.delete("regularMarketChangePercent")
      |> Map.delete("regularMarketTime")

    assert {:ok, %Quote{regular_market_change: nil}} = Quote.from_yahoo(raw)
  end
end
