import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_ENVIRONMENT: "dev" } }));
vi.mock("@/features/music/video-duration", () => ({
  fetchVideoDurationSeconds: vi.fn(),
}));

import { fetchVideoDurationSeconds } from "@/features/music/video-duration";
import { songClipError } from "@/features/moments/song-clip-check";
import type { NoteSaveRequest } from "@/features/moments/models/requests";

const save: NoteSaveRequest = {
  text: "hello",
  color: "mist",
  pattern: "plain",
  photo: "none",
  photoFile: null,
  song: {
    videoId: "vid1",
    title: "Playing God",
    channelTitle: "Polyphia",
    thumbnailUrl: "https://i.ytimg.com/vi/vid1/hqdefault.jpg",
  },
  songClip: { startSeconds: 42, endSeconds: 72 },
  place: null,
  date: null,
};

describe("R3: songClipError", () => {
  const lookup = vi.mocked(fetchVideoDurationSeconds);
  const answer = async (response: Response | null) =>
    response && { status: response.status, body: await response.json() };
  let consoleError: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    lookup.mockReset();
    consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  test("no clip means no lookup and no error", async () => {
    expect(await songClipError({ ...save, songClip: null })).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  test("no song means no lookup and no error", async () => {
    expect(
      await songClipError({ ...save, song: null, songClip: null }),
    ).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  test("a clip that fits answers null, looked up by the song's videoId", async () => {
    lookup.mockResolvedValue(72);

    expect(await songClipError(save)).toBeNull();
    expect(lookup).toHaveBeenCalledWith("vid1");
  });

  test("one second past the end answers 400", async () => {
    lookup.mockResolvedValue(71);

    expect(await answer(await songClipError(save))).toEqual({
      status: 400,
      body: { message: "The clip runs past the end of the song." },
    });
  });

  test("a missing video answers 400", async () => {
    lookup.mockResolvedValue(null);

    expect(await answer(await songClipError(save))).toEqual({
      status: 400,
      body: { message: "That song is no longer on YouTube." },
    });
  });

  test("a failed lookup answers 502 and logs the error", async () => {
    const failure = new Error("quota");
    lookup.mockRejectedValue(failure);

    expect(await answer(await songClipError(save))).toEqual({
      status: 502,
      body: { message: "Couldn't check the song length. Try again." },
    });
    expect(
      consoleError.mock.calls.some((call: unknown[]) => call.includes(failure)),
    ).toBe(true);
  });
});
