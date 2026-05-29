defmodule TheNextSemisWeb.PageController do
  use TheNextSemisWeb, :controller

  def home(conn, _params) do
    render(conn, :home)
  end

  def health(conn, _params) do
    text(conn, "ok")
  end
end
