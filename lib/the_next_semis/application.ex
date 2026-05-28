defmodule TheNextSemis.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      TheNextSemisWeb.Telemetry,
      {DNSCluster, query: Application.get_env(:the_next_semis, :dns_cluster_query) || :ignore},
      {Phoenix.PubSub, name: TheNextSemis.PubSub},
      # Start a worker by calling: TheNextSemis.Worker.start_link(arg)
      # {TheNextSemis.Worker, arg},
      # Start to serve requests, typically the last entry
      TheNextSemisWeb.Endpoint
    ]

    # See https://hexdocs.pm/elixir/Supervisor.html
    # for other strategies and supported options
    opts = [strategy: :one_for_one, name: TheNextSemis.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # Tell Phoenix to update the endpoint configuration
  # whenever the application is updated.
  @impl true
  def config_change(changed, _new, removed) do
    TheNextSemisWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
