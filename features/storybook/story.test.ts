import { describe, expect, test } from "vitest";
import { ENVS, SCENE_ENV, STORY, envIndices } from "@/features/storybook/story";

describe("R2: story config ported verbatim", () => {
  test("intro, book and ending text match the handoff", () => {
    expect(STORY.book).toEqual({
      title: "Our Little World",
      subtitle: "a pop-up book about the two of us",
      volume: "Vol. I",
    });
    expect(STORY.intro).toEqual({
      kicker: "Once upon a time, two people met…",
      hint: "Scroll to open the book",
    });
    expect(STORY.ending).toMatchObject({
      title: "Our Little World",
      line: "to be continued, together",
      button: "Log in",
    });
  });

  test("three chapters in order, with scene, caption and alt", () => {
    expect(STORY.chapters.map((ch) => [ch.number, ch.title, ch.scene])).toEqual(
      [
        ["Chapter One", "Our Little Beginning", "spring"],
        ["Chapter Two", "Adventures Together", "lake"],
        ["Chapter Three", "Our Favorite Moments", "sunset"],
      ],
    );
    expect(STORY.chapters[0].caption).toBe(
      "It started with a small hello. Somehow your hand fit perfectly in mine.",
    );
    expect(STORY.chapters[2].alt).toBe(
      "Sitting on a bench by the sea at sunset, she rests her head on his shoulder.",
    );
  });

  test("auth config is dropped", () => {
    expect(STORY).not.toHaveProperty("auth");
  });

  test("one environment per moment: intro, three chapters, ending", () => {
    expect(ENVS).toHaveLength(5);
  });
});

describe("R2: envIndices", () => {
  test("SCENE_ENV maps each scene to its light", () => {
    expect(SCENE_ENV).toEqual({ spring: 1, lake: 2, sunset: 3 });
  });

  test("intro, each chapter's scene env, then the ending", () => {
    expect(envIndices).toEqual([0, 1, 2, 3, 4]);
    expect(envIndices).toHaveLength(STORY.chapters.length + 2);
  });
});
