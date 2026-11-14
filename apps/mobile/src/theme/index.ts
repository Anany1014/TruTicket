/**
 * Theme for the mobile app. Values come from the shared tokens file so
 * mobile and web never drift apart. Do not hard-code colours in screens.
 *
 * Mobile UI theme (14 Nov, user request): dark base with a lime accent and
 * purple tags, matching the reference screens. Only the mobile app uses these
 * overrides. The shared tokens file is unchanged, so web is not affected.
 * The logo is not changed.
 */
import tokens from "../../../../packages/ui-tokens/tokens.json";

const LIME = "#C8F135";
const PURPLE = "#8B5CF6";

export const colors = {
  ...tokens.color,
  brand: {
    ...tokens.color.brand,
    cyan: LIME,
    ctaCyan: LIME,
    purple: PURPLE,
  },
  bg: {
    base: "#0A0A0C",
    surface: "#111114",
    card: "#16161B",
    raised: "#1F1F26",
    border: "#2A2A33",
  },
  text: {
    ...tokens.color.text,
    secondary: "#C9CBD2",
    muted: "#8A8D99",
  },
};

export const radius = tokens.radius;
export const space = tokens.space;
export const fontSize = tokens.font.size;

export const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const brandMark = require("../../assets/images/logo-mark.png");
