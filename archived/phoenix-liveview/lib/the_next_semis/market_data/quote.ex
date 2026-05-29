defmodule TheNextSemis.MarketData.Quote do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  embedded_schema do
    field(:ticker, :string)
    field(:price, :float)
    field(:currency, :string)
    field(:regular_market_change, :float)
    field(:regular_market_change_percent, :float)
    field(:timestamp, :integer)
  end

  @required [:ticker, :price, :currency]
  @optional [:regular_market_change, :regular_market_change_percent, :timestamp]

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
    |> validate_number(:price, greater_than: 0)
  end

  @doc """
  Build a Quote from a Yahoo Finance quoteResponse result map.
  Returns `{:ok, %Quote{}}` or `{:error, changeset}`.
  """
  def from_yahoo(%{} = raw) do
    attrs = %{
      ticker: raw["symbol"],
      price: raw["regularMarketPrice"],
      currency: raw["currency"],
      regular_market_change: raw["regularMarketChange"],
      regular_market_change_percent: raw["regularMarketChangePercent"],
      timestamp: raw["regularMarketTime"]
    }

    case changeset(attrs) do
      %{valid?: true} = cs -> {:ok, Ecto.Changeset.apply_changes(cs)}
      cs -> {:error, cs}
    end
  end
end
