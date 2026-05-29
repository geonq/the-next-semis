defmodule TheNextSemisWeb.Layouts do
  @moduledoc """
  This module holds layouts and related functionality
  used by your application.
  """
  use TheNextSemisWeb, :html

  # Embed all files in layouts/* within this module.
  # The default root.html.heex file contains the HTML
  # skeleton of your application, namely HTML headers
  # and other static content.
  embed_templates "layouts/*"

  @doc """
  Renders your app layout.

  This function is typically invoked from every template,
  and it often contains your application menu, sidebar,
  or similar.

  ## Examples

      <Layouts.app flash={@flash}>
        <h1>Content</h1>
      </Layouts.app>

  """
  attr :flash, :map, required: true, doc: "the map of flash messages"

  attr :current_scope, :map,
    default: nil,
    doc: "the current [scope](https://hexdocs.pm/phoenix/scopes.html)"

  attr :inner_content, :any, default: nil
  slot :inner_block

  def app(assigns) do
    ~H"""
    <header class="sticky top-0 z-10 border-b border-[var(--color-grid)] bg-[var(--color-bg)]">
      <div class="mx-auto flex max-w-7xl items-center justify-between px-6 h-12">
        <a href="/" class="text-sm font-medium text-base-content">
          The Next Semis
        </a>
        <nav class="flex items-center gap-6 text-sm text-[var(--color-neutral)]">
          <a
            data-nav-path="/"
            class="nav-link hover:text-base-content transition-colors"
            href="/"
          >
            Overview
          </a>
          <a
            data-nav-path="/portfolio"
            class="nav-link hover:text-base-content transition-colors"
            href="/portfolio"
          >
            Portfolio
          </a>
          <a
            data-nav-path="/research"
            class="nav-link hover:text-base-content transition-colors"
            href="/research"
          >
            Research
          </a>
          <.theme_toggle />
        </nav>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-6 py-10">
      <%= if @inner_block != [] do %>
        {render_slot(@inner_block)}
      <% else %>
        {@inner_content}
      <% end %>
    </main>

    <.flash_group flash={@flash} />
    """
  end

  @doc """
  Shows the flash group with standard titles and content.

  ## Examples

      <.flash_group flash={@flash} />
  """
  attr :flash, :map, required: true, doc: "the map of flash messages"
  attr :id, :string, default: "flash-group", doc: "the optional id of flash container"

  def flash_group(assigns) do
    ~H"""
    <div id={@id} aria-live="polite">
      <.flash kind={:info} flash={@flash} />
      <.flash kind={:error} flash={@flash} />

      <.flash
        id="client-error"
        kind={:error}
        title={gettext("We can't find the internet")}
        phx-disconnected={show(".phx-client-error #client-error") |> JS.remove_attribute("hidden")}
        phx-connected={hide("#client-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>

      <.flash
        id="server-error"
        kind={:error}
        title={gettext("Something went wrong!")}
        phx-disconnected={show(".phx-server-error #server-error") |> JS.remove_attribute("hidden")}
        phx-connected={hide("#server-error") |> JS.set_attribute({"hidden", ""})}
        hidden
      >
        {gettext("Attempting to reconnect")}
        <.icon name="hero-arrow-path" class="ml-1 size-3 motion-safe:animate-spin" />
      </.flash>
    </div>
    """
  end

  @doc """
  Provides dark vs light theme toggle based on themes defined in app.css.

  See <head> in root.html.heex which applies the theme before page load.
  """
  def theme_toggle(assigns) do
    ~H"""
    <button
      phx-click={JS.dispatch("phx:toggle-theme")}
      class="text-[var(--color-neutral)] hover:text-base-content transition-colors cursor-pointer"
      aria-label="Toggle theme"
    >
      <.icon name="hero-sun-micro" class="size-4 dark:hidden" />
      <.icon name="hero-moon-micro" class="size-4 hidden dark:block" />
    </button>
    """
  end
end
