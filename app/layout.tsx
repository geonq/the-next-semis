import type { Metadata } from "next";
import "./globals.css";
import { SiteNav } from "./site-nav";

export const metadata: Metadata = {
  title: "The Next Semis",
  description: "A live portfolio and research dashboard for the next AI-scale infrastructure boom."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <SiteNav />
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
