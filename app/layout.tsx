import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import BottomNav from "./components/BottomNav";
import GlobalSideDrawer from "./components/GlobalSideDrawer";
import NavigationEvents from "./components/NavigationEvents";
import ThemeModeBootstrap from "./components/ThemeModeBootstrap";
import AuraToast from "./components/AuraToast";
import HapticsProvider from "./components/HapticsProvider";
import PassRewardCollector from "./components/PassRewardCollector";
import { SessionProvider } from "./context/SessionProvider";

export const metadata: Metadata = {
  title: "Foopy | AFL Live Scores & Picks",
  description: "Live AFL scores, fixtures, ladders, player ratings and winner picks.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Foopy",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
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
      <body suppressHydrationWarning>
        <ThemeModeBootstrap />
        <HapticsProvider />
        <NavigationEvents />
        <SessionProvider>
          <GlobalSideDrawer />
          <div className="page-shell">
            {children}
          </div>
          <BottomNav />
          <PassRewardCollector />
          <AuraToast />
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
