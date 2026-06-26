import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk, Manrope } from "next/font/google";
import "./globals.css";
import { SiteNav } from "./site-nav";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-header", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-logo", display: "swap" });

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
    <html
      lang="en"
      data-theme="dark"
      className={`${inter.variable} ${spaceGrotesk.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
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
