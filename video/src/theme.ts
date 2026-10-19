/**
 * Fonts and colours. The type follows herdr.dev: Archivo for display, Inter for text, JetBrains Mono for code.
 * herdr-web-ui's colours are sampled from the screenshots in docs/, so the phone screens match the real app.
 */
import { loadFont as loadArchivo } from "@remotion/google-fonts/Archivo";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";

const archivo = loadArchivo("normal", { weights: ["800", "900"], subsets: ["latin"] });
const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const jetBrainsMono = loadJetBrainsMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export const fonts = {
  display: `${archivo.fontFamily}, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`,
  sans: `${inter.fontFamily}, -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif`,
  mono: `${jetBrainsMono.fontFamily}, Menlo, Monaco, monospace`,
};

export const stage = {
  bg: "#08090B",
  ink: "#F5F5F7",
  soft: "rgba(245,245,247,0.62)",
  faint: "rgba(245,245,247,0.38)",
  amber: "#F4B04A",
  coral: "#E8735A",
  mint: "#7DE2C3",
  sky: "#6CB8FF",
};

/** The Go Remote icon, sampled from it: petrol teal behind icy glyphs, and the aqua of the light between them. */
export const brand = {
  tealHi: "#2C4447",
  teal: "#213539",
  tealDeep: "#091517",
  /** Darker than the icon's own teal, so the icon stands off the stage behind it. */
  stage: "#122629",
  ice: "#E2F4F5",
  aqua: "#8CE9E4",
  aquaRgb: "140,233,228",
};

/** Claude Code's dark theme, as it renders in a true-colour terminal. */
export const claude = {
  bg: "#0D0E11",
  fg: "#E8E8E8",
  dim: "#8C9099",
  faint: "#5C616B",
  orange: "#D77757",
  green: "#4EBA65",
  red: "#FF6B80",
  blue: "#7AA7FF",
  purple: "#C397F5",
  yellow: "#E9C46A",
  cyan: "#6FD3D3",
  addBg: "rgba(78,186,101,0.20)",
  addSign: "#5FCF78",
  delBg: "rgba(255,107,128,0.17)",
  delSign: "#FF8A9A",
  border: "#5F636B",
};

export const herdrLight = {
  chrome: "#FAF8F3",
  bg: "#EEEAE2",
  bubble: "#F2EEE6",
  line: "#DCD4C6",
  ink: "#16120D",
  body: "#2A251F",
  muted: "#685E52",
  accent: "#8C5000",
  toggle: "#F2EEE6",
  toggleOn: "#E8E2D6",
  claude: "#D77655",
  live: "#2F6317",
  composer: "#F2EDE4",
  pill: "#E8E2D6",
  send: "#D29E51",
  sendIcon: "#5B5449",
};

export const herdrDark = {
  bg: "#181613",
  toggle: "#211E1A",
  toggleOn: "#2A2621",
  accent: "#F0A830",
  text: "#D8D0C3",
  muted: "#8E857A",
  green: "#8AE234",
  blue: "#729FCF",
  keyLine: "#2D2823",
  key: "#D7CEC1",
  line: "#2A2620",
};
