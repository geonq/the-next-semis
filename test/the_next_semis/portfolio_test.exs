defmodule TheNextSemis.PortfolioTest do
  use ExUnit.Case, async: false

  alias TheNextSemis.{Portfolio, MarketData.Quote}

  # Hand-verified fixture:
  # 10 shares, avg cost $100, current $135 → value=$1350, PnL=$350, PnL%=35%
  @nvda_position %{
    "ticker" => "NVDA",
    "company" => "NVIDIA",
    "shares" => 10,
    "average_cost" => 100.0,
    "currency" => "USD"
  }

  @nvda_quote %Quote{
    ticker: "NVDA",
    price: 135.0,
    currency: "USD",
    regular_market_change: 2.5,
    regular_market_change_percent: 1.89,
    timestamp: 1_716_900_000
  }

  describe "enrich_positions/2" do
    test "computes total_value, pnl_dollars, pnl_percent correctly" do
      quotes = %{"NVDA" => @nvda_quote}
      [pos] = Portfolio.enrich_positions([@nvda_position], quotes)

      assert pos["total_value"] == 1350.0
      assert pos["pnl_dollars"] == 350.0
      assert_in_delta pos["pnl_percent"], 35.0, 0.001
    end

    test "zero avg_cost results in 0.0 pnl_percent (no division by zero)" do
      position = Map.put(@nvda_position, "average_cost", 0)
      quotes = %{"NVDA" => @nvda_quote}
      [pos] = Portfolio.enrich_positions([position], quotes)

      assert pos["pnl_percent"] == 0.0
    end

    test "missing quote marks position as no_data" do
      [pos] = Portfolio.enrich_positions([@nvda_position], %{})
      assert pos["quote_status"] == :no_data
    end

    test "zero shares produces zero total_value and pnl" do
      position = Map.put(@nvda_position, "shares", 0)
      quotes = %{"NVDA" => @nvda_quote}
      [pos] = Portfolio.enrich_positions([position], quotes)

      assert pos["total_value"] == 0.0
      assert pos["pnl_dollars"] == 0.0
    end
  end

  describe "summary/1" do
    test "aggregates total_value and day_change across positions" do
      # 10 shares × $135 = $1350, day_change $2.5/share → +$25
      quotes = %{"NVDA" => @nvda_quote}
      enriched = Portfolio.enrich_positions([@nvda_position], quotes)
      s = Portfolio.summary(enriched)

      assert s.total_value == 1350.0
      assert_in_delta s.day_change_dollars, 25.0, 0.001
    end

    test "positions with no_data are excluded from totals" do
      enriched = Portfolio.enrich_positions([@nvda_position], %{})
      s = Portfolio.summary(enriched)

      assert s.total_value == 0.0
      assert s.day_change_dollars == 0.0
      assert s.day_change_percent == 0.0
    end
  end

  describe "load_positions/0" do
    setup do
      previous_data_dir = Application.get_env(:the_next_semis, :data_dir)

      data_dir =
        Path.join(
          System.tmp_dir!(),
          "the_next_semis_positions_#{System.unique_integer([:positive])}"
        )

      File.mkdir_p!(data_dir)

      Application.put_env(:the_next_semis, :data_dir, data_dir)

      on_exit(fn ->
        if previous_data_dir do
          Application.put_env(:the_next_semis, :data_dir, previous_data_dir)
        else
          Application.delete_env(:the_next_semis, :data_dir)
        end

        File.rm_rf!(data_dir)
      end)

      %{data_dir: data_dir}
    end

    test "valid positions JSON is Ecto-validated and normalized", %{data_dir: data_dir} do
      File.write!(
        Path.join(data_dir, "positions.example.json"),
        Jason.encode!([@nvda_position])
      )

      assert {:ok, [%{"ticker" => "NVDA", "shares" => 10.0, "average_cost" => 100.0}]} =
               Portfolio.load_positions()
    end

    test "malformed JSON returns an explicit parse error", %{data_dir: data_dir} do
      File.write!(Path.join(data_dir, "positions.example.json"), "{")

      assert {:error, {:invalid_json, _path, %Jason.DecodeError{}}} = Portfolio.load_positions()
    end

    test "wrong record shape returns an explicit validation error", %{data_dir: data_dir} do
      File.write!(
        Path.join(data_dir, "positions.example.json"),
        Jason.encode!([Map.delete(@nvda_position, "ticker")])
      )

      assert {:error, {:invalid_records, _path, [{0, changeset}]}} = Portfolio.load_positions()
      assert {:ticker, _} = hd(changeset.errors)
    end
  end
end
