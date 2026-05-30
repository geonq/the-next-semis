"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/research", label: "Research" }
];

export function SiteNav() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    setIsAdmin(document.cookie.includes("is_admin=1"));
  }, [pathname]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setIsAdmin(false);
    window.location.reload();
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="brand" href="/">
          The Next Semis
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={active ? "active" : ""} href={item.href} key={item.href}>
                {item.label}
              </Link>
            );
          })}
          {isAdmin ? (
            <button className="theme-toggle" onClick={handleLogout} type="button">
              logout
            </button>
          ) : (
            <Link className={pathname === "/login" ? "active" : ""} href="/login">
              login
            </Link>
          )}
          <button
            className="theme-toggle"
            aria-label="Toggle theme"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? "◐" : "●"}
          </button>
        </nav>
      </div>
    </header>
  );
}
