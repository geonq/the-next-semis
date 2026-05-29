defmodule TheNextSemis.ResearchTest do
  use ExUnit.Case, async: false

  alias TheNextSemis.{MarketData.Quote, Research}

  @entry %{
    "ticker" => "ASML",
    "company" => "ASML Holding",
    "theme" => "Semiconductor equipment",
    "conditions" => [
      "Advanced-node demand accelerates",
      "Memory capex recovers"
    ],
    "conviction" => "draft",
    "status" => "watching"
  }

  setup do
    previous_data_dir = Application.get_env(:the_next_semis, :data_dir)

    data_dir =
      Path.join(
        System.tmp_dir!(),
        "the_next_semis_watchlist_#{System.unique_integer([:positive])}"
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

  describe "load_watchlist/0" do
    test "valid watchlist JSON is Ecto-validated and normalized", %{data_dir: data_dir} do
      File.write!(Path.join(data_dir, "watchlist.example.json"), Jason.encode!([@entry]))

      assert {:ok, [%{"ticker" => "ASML", "status" => "watching"}]} = Research.load_watchlist()
    end

    test "invalid status returns an explicit validation error", %{data_dir: data_dir} do
      File.write!(
        Path.join(data_dir, "watchlist.example.json"),
        Jason.encode!([Map.put(@entry, "status", "maybe")])
      )

      assert {:error, {:invalid_records, _path, [{0, changeset}]}} = Research.load_watchlist()
      assert {:status, _} = hd(changeset.errors)
    end
  end

  describe "enrich_watchlist/2" do
    test "merges quote data into watchlist entries" do
      quote = %Quote{
        ticker: "ASML",
        price: 900.0,
        currency: "EUR",
        regular_market_change: 12.0,
        regular_market_change_percent: 1.35
      }

      [entry] = Research.enrich_watchlist([@entry], %{"ASML" => quote})

      assert entry["current_price"] == 900.0
      assert entry["day_change"] == 12.0
      assert entry["day_change_percent"] == 1.35
    end

    test "marks entries with missing quotes as no_data" do
      [entry] = Research.enrich_watchlist([@entry], %{})

      assert entry["quote_status"] == :no_data
    end
  end
end
