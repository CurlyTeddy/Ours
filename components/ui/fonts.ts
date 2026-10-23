import { Caveat, Homemade_Apple, Nunito, Playpen_Sans } from "next/font/google";

export const playpenSans = Playpen_Sans({
  weight: ["300", "400", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

// Variable font: one file covers the storybook's 400–700 and the Moments UI's 500–900.
export const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  variable: "--f-ui",
});

export const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  variable: "--f-caveat",
});

export const homemadeApple = Homemade_Apple({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--f-homemade-apple",
});
