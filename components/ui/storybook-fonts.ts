import { Corben, Gaegu, Nunito } from "next/font/google";

// Storybook landing page fonts, kept out of fonts.ts so other routes (via the root layout) never load them.
export const corben = Corben({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--f-display",
});

export const gaegu = Gaegu({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--f-hand",
});

export const nunito = Nunito({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--f-ui",
});
