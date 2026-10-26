import { useColorScheme } from "react-native";

export const plate = {
  red: "#D7263D",
  blue: "#1F6FD1",
  yellow: "#F2C230",
  green: "#2E9E5B",
};

const dark = {
  bg: "#1B2027",
  raised: "#252B33",
  line: "#343B45",
  text: "#EEF0EA",
  muted: "#8C96A0",
  accent: plate.yellow,
  accentInk: "#1B2027",
  danger: plate.red,
  ok: plate.green,
  track: "#2E353E",
};

const light = {
  bg: "#F2F4F6",
  raised: "#FFFFFF",
  line: "#D9DEE3",
  text: "#1B2027",
  muted: "#5B6570",
  accent: plate.yellow,
  accentInk: "#1B2027",
  danger: plate.red,
  ok: plate.green,
  track: "#E4E8EC",
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
export const radius = { sm: 8, md: 12, lg: 18, pill: 999 };
export const touch = 52;

/** The palette for the current system appearance. Dark is the default in a gym. */
export function useTheme(): Palette {
  const scheme = useColorScheme();
  return scheme === "light" ? light : dark;
}

export const dataColors = [plate.blue, plate.yellow, plate.green, plate.red, "#8C96A0", "#B58BD6"];
