/* =====================================================================
   STORY CONFIG — words, colours and scene choices live here.
   chapters: 2 or 3 entries. `scene` picks a pop-up layout from SCENES
   ('spring' | 'lake' | 'sunset').
   ===================================================================== */
export interface Chapter {
  number: string;
  title: string;
  scene: keyof typeof SCENE_ENV;
  caption: string;
  alt: string;
  headInk: string;
  capInk: string;
  headShadow?: string;
}

export const SCENE_ENV = { spring: 1, lake: 2, sunset: 3 };

export const STORY = {
  book: {
    title: "Our Little World",
    subtitle: "a pop-up book about the two of us",
    volume: "Vol. I",
  },
  intro: {
    kicker: "Once upon a time, two people met…",
    hint: "Scroll to open the book",
  },
  chapters: [
    {
      number: "Chapter One",
      title: "Our Little Beginning",
      scene: "spring",
      caption:
        "It started with a small hello. Somehow your hand fit perfectly in mine.",
      alt: "Paper figures of the two of us walk hand in hand through a spring park with cherry trees, a bench and paper hearts.",
      headInk: "#4c3236",
      capInk: "#4c3236",
    },
    {
      number: "Chapter Two",
      title: "Adventures Together",
      scene: "lake",
      caption: "A lake, a mountain, and you laughing at the wind in your hair.",
      alt: "The two of us stand by a mountain lake with paper boats, a lighthouse, orange-roofed houses and a white pagoda.",
      headInk: "#25384f",
      capInk: "#2c3a4a",
    },
    {
      number: "Chapter Three",
      title: "Our Favorite Moments",
      scene: "sunset",
      caption:
        "One bench, two warm mugs, and the whole sky turning pink just for us.",
      alt: "Sitting on a bench by the sea at sunset, she rests her head on his shoulder.",
      headInk: "#fff3e6",
      capInk: "#4a2a33",
      headShadow: "0 1px 14px rgba(70,35,60,.5)",
    },
  ] as Chapter[],
  ending: {
    title: "Our Little World",
    line: "to be continued, together",
    button: "Log in",
    backLine: "to be continued…",
    backSmall: "Folded by hand · an edition of two",
  },
};

/* Backgrounds and light for each moment of the story: intro, one per chapter, ending. */
export const ENVS: {
  bg: string;
  key: string;
  keyI: number;
  sky: string;
  ground: string;
  hemiI: number;
  amb: number;
  sun: [number, number, number];
}[] = [
  {
    bg: "radial-gradient(120% 90% at 50% 40%,#f4ede3 0%,#e9e0d3 55%,#d9ccbb 100%)",
    key: "#fff4e6",
    keyI: 0.82,
    sky: "#fdf6ec",
    ground: "#b9a993",
    hemiI: 0.5,
    amb: 0.07,
    sun: [0.55, 1.6, 1.25],
  },
  {
    bg: "linear-gradient(180deg,#fbe3e2 0%,#f7d6d6 45%,#efe2d6 100%)",
    key: "#fff0ea",
    keyI: 0.8,
    sky: "#fff1f1",
    ground: "#c6ad9e",
    hemiI: 0.5,
    amb: 0.07,
    sun: [0.7, 1.5, 1.35],
  },
  {
    bg: "linear-gradient(180deg,#bcd6ea 0%,#d9e8f2 50%,#efebe2 100%)",
    key: "#fffaf0",
    keyI: 0.84,
    sky: "#eaf4ff",
    ground: "#b7ae98",
    hemiI: 0.5,
    amb: 0.07,
    sun: [-0.6, 1.7, 1.2],
  },
  {
    bg: "linear-gradient(180deg,#7f6aa5 0%,#c57f9c 40%,#ee9b86 70%,#f8d09a 100%)",
    key: "#ffc796",
    keyI: 0.92,
    sky: "#f3c2c9",
    ground: "#8c6f83",
    hemiI: 0.46,
    amb: 0.06,
    sun: [-1.1, 0.75, -0.9],
  },
  {
    bg: "radial-gradient(90% 75% at 50% 42%,#cfdbe5 0%,#a9bfd0 55%,#88a2b8 100%)",
    key: "#f6f8ff",
    keyI: 0.78,
    sky: "#e6eef6",
    ground: "#93a3b2",
    hemiI: 0.5,
    amb: 0.07,
    sun: [-0.4, 1.7, 1.1],
  },
];

/* Which ENVS/SKIES entry each moment uses: intro, one per chapter, ending. */
export const envIndices: number[] = [
  0,
  ...STORY.chapters.map((ch) => SCENE_ENV[ch.scene]),
  4,
];
