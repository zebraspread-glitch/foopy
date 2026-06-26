import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.foopy.app",
  appName: "Foopy",

  webDir: "public",

  // Production: the native shell loads the live hosted site over HTTPS.
  // For LOCAL DEV only, temporarily swap this for your dev server, e.g.
  //   server: { url: "http://192.168.1.18:3000", cleartext: true },
  // Never ship cleartext/http to the App Store — Apple rejects it.
  server: {
    url: "https://foopy.app",
  },

  ios: {
    contentInset: "always",
    backgroundColor: "#000000",
    scrollEnabled: false,
  },

  android: {
    backgroundColor: "#000000",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#000000",
      showSpinner: false,
    },
    StatusBar: {
      style: "Dark",
      backgroundColor: "#000000",
      overlaysWebView: true,
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      // Show alert/badge/sound while the app is in the foreground too.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;