defmodule TheNextSemisWeb.PageController do
  use TheNextSemisWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end
end
