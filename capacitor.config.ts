import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.foopy.app",
  appName: "Foopy",

  webDir: "public",

  server: {
    url: "http://192.168.1.18:3000",
    cleartext: true,
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
  },
};

export default config;