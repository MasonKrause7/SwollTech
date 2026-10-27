import { useColorScheme } from "react-native";

/* "Chalk and iron". Matches the tokens in apps/web/src/styles.css; see DESIGN.md. */

/** Competition plate colours. Only for drawing real plates, never for UI. */
export const plate = {
  red: "#D7263D",
  blue: "#1F6FD1",
  yellow: "#F2C230",
  green: "#2E9E5B",
};

const dark = {
  bg: "#0F1011",
  raised: "#17181A",
  line: "#26282B",
  text: "#F4F4F2",
  muted: "#8E9196",
  /** Primary actions and selection: chalk on iron. */
  accent: "#F4F4F2",
  accentInk: "#0F1011",
  /** Records, streaks, progress and the active tab. Use sparingly. */
  highlight: "#FF5A1F",
  highlightInk: "#0F1011",
  danger: "#F0524F",
  ok: "#3CCB7F",
  track: "#232427",
};

const light = {
  bg: "#F4F4F2",
  raised: "#FFFFFF",
  line: "#DEDED9",
  text: "#0F1011",
  muted: "#5E6166",
  accent: "#0F1011",
  accentInk: "#F4F4F2",
  highlight: "#E4480E",
  highlightInk: "#FFFFFF",
  danger: "#C62F2F",
  ok: "#1F8A52",
  track: "#E6E6E2",
};

export type Palette = typeof dark;

export const fonts = {
  display: "BarlowCondensed_700Bold",
  displaySemi: "BarlowCondensed_600SemiBold",
  body: "Barlow_400Regular",
  bodyMedium: "Barlow_500Medium",
  bodySemi: "Barlow_600SemiBold",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 };
export const touch = 52;

/** The palette for the current system appearance. Dark is the default in a gym. */
export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === "light" ? light : dark;
}

/** Data series in order of use: orange leads, the rest stay quiet. */
export const dataColors = ["#FF5A1F", "#F4F4F2", "#7F9FBF", "#C9B08A", "#6E7176", "#6F9A82"];
