import type { AppConfig } from "./config";

export const appConfig: AppConfig = {
  app: {
    name: "BINO",
    tagline: "זיכרון תפעולי חכם לבניינים",
    icon: "icon.png",
    platform: "web",
    url: "bino.app",
  },
  brand: {
    primary: "#0066FF",
    primaryLight: "#E5F0FF",
    background: "#F2F5FA",
    surface: "#FFFFFF",
    textPrimary: "#0B1220",
    textSecondary: "#5A6578",
    success: "#34C759",
    danger: "#FF3B30",
  },
  video: {
    fps: 30,
    width: 1920,
    height: 1080,
    browser: "chrome-desktop",
    backgroundMusic: "music/upbeat-corporate.mp3",
    backgroundMusicVolume: 0.28,
  },
};
