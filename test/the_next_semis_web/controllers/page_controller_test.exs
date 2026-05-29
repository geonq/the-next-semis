defmodule TheNextSemisWeb.PageControllerTest do
  use TheNextSemisWeb.ConnCase

  test "GET / renders overview LiveView", %{conn: conn} do
    conn = get(conn, ~p"/")
    assert html_response(conn, 200) =~ "Top Gainers"
  end

  test "GET /portfolio renders portfolio LiveView", %{conn: conn} do
    conn = get(conn, ~p"/portfolio")
    assert html_response(conn, 200) =~ "Portfolio"
  end
end
