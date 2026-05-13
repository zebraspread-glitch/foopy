import "./globals.css";
import type { Metadata, Viewport } from "next";
import BottomNav from "./components/BottomNav";
import GlobalSideDrawer from "./components/GlobalSideDrawer";
import NavigationEvents from "./components/NavigationEvents";
import { XPProvider } from "./context/XPContext";
import XPLevelUpGate from "./components/XPLevelUpGate";

export const metadata: Metadata = {
  title: "Foopy | AFL Live Scores & Picks",
  description: "Live AFL scores, fixtures, ladders, player ratings and winner picks.",
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Foopy",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="dark" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="preconnect" href="https://api.squiggle.com.au" />
        <link rel="dns-prefetch" href="https://api.squiggle.com.au" />
        <link rel="preconnect" href="https://footywire.com" />
      </head>
      <body>
        <XPProvider>
          <NavigationEvents />
          <GlobalSideDrawer />
          <div className="page-shell">
            {children}
          </div>
          <BottomNav />
          <XPLevelUpGate />
        </XPProvider>
      </body>
    </html>
  );
}
