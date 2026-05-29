defmodule TheNextSemis.Portfolio.Position do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  embedded_schema do
    field(:ticker, :string)
    field(:company, :string)
    field(:shares, :float)
    field(:average_cost, :float)
    field(:currency, :string)
    field(:sector, :string)
    field(:thesis_id, :string)
  end

  @required [:ticker, :company, :shares, :average_cost, :currency]
  @optional [:sector, :thesis_id]

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, @required ++ @optional)
    |> validate_required(@required)
    |> validate_number(:shares, greater_than_or_equal_to: 0)
    |> validate_number(:average_cost, greater_than_or_equal_to: 0)
  end

  def from_json(%{} = attrs) do
    case changeset(attrs) do
      %{valid?: true} = changeset ->
        {:ok, changeset |> Ecto.Changeset.apply_changes() |> to_map()}

      changeset ->
        {:error, changeset}
    end
  end

  def from_json(_attrs), do: {:error, :not_a_map}

  defp to_map(position) do
    %{
      "ticker" => position.ticker,
      "company" => position.company,
      "shares" => position.shares,
      "average_cost" => position.average_cost,
      "currency" => position.currency,
      "sector" => position.sector,
      "thesis_id" => position.thesis_id
    }
  end
end
