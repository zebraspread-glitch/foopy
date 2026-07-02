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
import DailyAuraCollector from "./components/DailyAuraCollector";
import SplashScreen from "./components/SplashScreen";
import OfflineBanner from "./components/OfflineBanner";
import ServiceOutageBanner from "./components/ServiceOutageBanner";
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
        <link rel="preconnect" href="https://footywire.com" />
        {/* Pre-paint: skip the splash instantly on repeat loads within a session
            so it only flashes on the very first load. Runs before <body> paints. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(sessionStorage.getItem('foopy_splash_shown'))document.documentElement.setAttribute('data-foopy-loaded','1')}catch(e){}",
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {/* First-load black splash is pure CSS (body::before/::after in
            globals.css); SplashScreen just toggles data-foopy-loaded when ready. */}
        <SplashScreen />
        <OfflineBanner />
        <ServiceOutageBanner />
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
          <DailyAuraCollector />
          <AuraToast />
        </SessionProvider>
        <Analytics />
      </body>
    </html>
  );
}
