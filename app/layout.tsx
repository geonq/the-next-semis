import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteNav } from "./site-nav";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "geonq",
  description: "A live portfolio and research dashboard for the next AI-scale infrastructure boom."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <SiteNav />
        <main className="shell">{children}</main>
        <footer className="icon-attribution">
          <a href="https://www.streamlinehq.com" target="_blank" rel="noreferrer">
            Icons by Streamline
          </a>
        </footer>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
