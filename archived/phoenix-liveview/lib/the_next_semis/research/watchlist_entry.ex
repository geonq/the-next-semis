defmodule TheNextSemis.Research.WatchlistEntry do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key false
  embedded_schema do
    field(:ticker, :string)
    field(:company, :string)
    field(:theme, :string)
    field(:conditions, {:array, :string})
    field(:conviction, :string)
    field(:status, :string)
  end

  @required [:ticker, :company, :theme, :conditions, :conviction, :status]

  def changeset(attrs) do
    %__MODULE__{}
    |> cast(attrs, @required)
    |> validate_required(@required)
    |> validate_length(:conditions, min: 1)
    |> validate_inclusion(:status, ["watching", "triggered", "invalidated"])
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

  defp to_map(entry) do
    %{
      "ticker" => entry.ticker,
      "company" => entry.company,
      "theme" => entry.theme,
      "conditions" => entry.conditions,
      "conviction" => entry.conviction,
      "status" => entry.status
    }
  end
end
