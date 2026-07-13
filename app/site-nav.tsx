"use client";

import Link from "next/link";
import { HalfMoon, SunLight, UserCircle, UserXmark } from "iconoir-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

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
          <img
            src={theme === "dark" ? "/logo-white.png" : "/logo-dark.png"}
            alt="geonq"
            className="brand-logo"
            height={28}
            width={28}
          />
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link className={active ? "active" : ""} href={item.href} key={item.href}>
                {item.label}
                {active ? (
                  <motion.span
                    className="nav-active-indicator"
                    layoutId="nav-active-indicator"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                ) : null}
              </Link>
            );
          })}
          {isAdmin ? (
            <button className="theme-toggle" onClick={handleLogout} type="button" aria-label="Logout">
              <UserXmark width={16} height={16} />
            </button>
          ) : (
            <Link className={pathname === "/login" ? "active" : ""} href="/login" aria-label="Login">
              <UserCircle width={16} height={16} />
            </Link>
          )}
          <button
            className="theme-toggle"
            aria-label="Toggle theme"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? <SunLight width={16} height={16} /> : <HalfMoon width={16} height={16} />}
          </button>
        </nav>
      </div>
    </header>
  );
}
