import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSongDuration } from "@/features/moments/hooks/use-song-duration";
import { useSongPlayer } from "@/features/moments/hooks/use-song-player";

const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

interface PlayerOptions {
  videoId?: string;
  height?: number | string;
  width?: number | string;
  events?: {
    onReady?: (event: { target: FakePlayer }) => void;
    onStateChange?: (event: { data: number; target: FakePlayer }) => void;
    onError?: (event: { data: number; target: FakePlayer }) => void;
  };
}

// Each video's length as the player reports it; 0 means "not known yet", like a fresh cue.
let durations: Record<string, number> = {};

// Stands in for YT.Player: ready on the next tick, reports CUED after a cue like the real one
class FakePlayer {
  static instances: FakePlayer[] = [];
  calls: [string, unknown[]][] = [];
  videoId: string | null = null;
  destroyed = false;
  constructor(
    public element: unknown,
    public options: PlayerOptions,
  ) {
    FakePlayer.instances.push(this);
    if (options.videoId) this.videoId = options.videoId;
    setTimeout(() => {
      if (this.destroyed) return;
      options.events?.onReady?.({ target: this });
      if (options.videoId) this.emit(PlayerState.CUED);
    }, 0);
  }
  emit(state: number) {
    if (this.destroyed) return;
    this.options.events?.onStateChange?.({ data: state, target: this });
  }
  fail(code = 100) {
    this.options.events?.onError?.({ data: code, target: this });
  }
  private load(name: string, args: unknown[], state: number) {
    this.calls.push([name, args]);
    const [arg] = args;
    this.videoId =
      typeof arg === "string" ? arg : (arg as { videoId: string }).videoId;
    setTimeout(() => this.emit(state), 0);
  }
  cueVideoById = (...args: unknown[]) =>
    this.load("cueVideoById", args, PlayerState.CUED);
  loadVideoById = (...args: unknown[]) =>
    this.load("loadVideoById", args, PlayerState.PLAYING);
  playVideo = () => this.calls.push(["playVideo", []]);
  pauseVideo = () => this.calls.push(["pauseVideo", []]);
  stopVideo = () => this.calls.push(["stopVideo", []]);
  seekTo = (...args: unknown[]) => this.calls.push(["seekTo", args]);
  mute = () => this.calls.push(["mute", []]);
  unMute = () => this.calls.push(["unMute", []]);
  isMuted = () => false;
  setVolume = (...args: unknown[]) => this.calls.push(["setVolume", args]);
  getPlayerState = () => PlayerState.CUED;
  getCurrentTime = () => 0;
  durationReads = 0;
  getDuration = () => {
    this.durationReads += 1;
    return this.videoId === null ? 0 : (durations[this.videoId] ?? 0);
  };
  getVideoData = () => ({ video_id: this.videoId ?? "" });
  getVideoUrl = () => `https://www.youtube.com/watch?v=${this.videoId ?? ""}`;
  getIframe = () => document.createElement("iframe");
  destroy = () => {
    this.calls.push(["destroy", []]);
    this.destroyed = true;
  };
}

const installYouTube = () => {
  (window as unknown as { YT: unknown }).YT = {
    Player: FakePlayer,
    PlayerState,
    loaded: 1,
  };
};
const cuedIds = (player: FakePlayer) =>
  player.calls
    .filter(([name]) => name === "cueVideoById" || name === "loadVideoById")
    .map(([, [arg]]) =>
      typeof arg === "string" ? arg : (arg as { videoId: string }).videoId,
    )
    .concat(player.options.videoId ? [player.options.videoId] : []);
// The player measuring a given video: either it was created for it or cued it
const playerFor = (videoId: string) =>
  FakePlayer.instances.findLast((player) => cuedIds(player).includes(videoId));
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  durations = {};
  installYouTube();
});

afterEach(() => {
  FakePlayer.instances = [];
  vi.useRealTimers();
});

describe("R13: useSongDuration", () => {
  test("is idle with no video", () => {
    const { result } = renderHook(() => useSongDuration(null));

    expect(result.current).toEqual({ status: "idle", durationSeconds: null });
  });

  test("is loading until the player knows the length", () => {
    const { result } = renderHook(() => useSongDuration("vid1"));

    expect(result.current).toEqual({
      status: "loading",
      durationSeconds: null,
    });
  });

  test("cues the video in its own player and reports the length, floored", async () => {
    durations = { vid1: 212.9 };
    const { result } = renderHook(() => useSongDuration("vid1"));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        durationSeconds: 212,
      }),
    );
    expect(playerFor("vid1")).toBeDefined();
    // Measuring never starts playback
    expect(
      playerFor("vid1")?.calls.some(([name]) => name === "loadVideoById"),
    ).toBe(false);
  });

  test("a length of 0 right after the cue is polled until it is known", async () => {
    const { result } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    await flush();
    await flush();
    expect(result.current.status).toBe("loading");

    durations = { vid1: 92.4 };

    await waitFor(
      () =>
        expect(result.current).toEqual({
          status: "ready",
          durationSeconds: 92,
        }),
      { timeout: 3000 },
    );
  });

  test("a song under 5 s is still ready, with its length", async () => {
    durations = { vid1: 3 };
    const { result } = renderHook(() => useSongDuration("vid1"));

    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", durationSeconds: 3 }),
    );
  });

  test("going from no video to a video loads it", async () => {
    durations = { vid1: 200 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSongDuration(id),
      { initialProps: { id: null as string | null } },
    );
    expect(result.current.status).toBe("idle");

    rerender({ id: "vid1" });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        durationSeconds: 200,
      }),
    );
  });

  test("going back to no video is idle again", async () => {
    durations = { vid1: 200 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSongDuration(id),
      { initialProps: { id: "vid1" as string | null } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ id: null });

    expect(result.current).toEqual({ status: "idle", durationSeconds: null });
  });
});

describe("R14: useSongDuration errors", () => {
  test("a player error for the video is an error", async () => {
    const { result } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    await flush();

    act(() => playerFor("vid1")?.fail(150));

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "error",
        durationSeconds: null,
      }),
    );
  });

  test("no length within 10 s is an error", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSongDuration("vid1"));
    await act(() => vi.advanceTimersByTimeAsync(9_000));
    expect(result.current.status).toBe("loading");

    await act(() => vi.advanceTimersByTimeAsync(1_500));

    expect(result.current).toEqual({ status: "error", durationSeconds: null });
  });

  test("a length that arrives before 10 s is not overridden by the timeout", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSongDuration("vid1"));
    await act(() => vi.advanceTimersByTimeAsync(100));
    durations = { vid1: 200 };
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current).toEqual({ status: "ready", durationSeconds: 200 });

    await act(() => vi.advanceTimersByTimeAsync(15_000));

    expect(result.current).toEqual({ status: "ready", durationSeconds: 200 });
  });
});

describe("R13/R18: changing the video", () => {
  test("a new video resets to loading, then reports its own length", async () => {
    durations = { vid1: 200 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSongDuration(id),
      { initialProps: { id: "vid1" } },
    );
    await waitFor(() => expect(result.current.durationSeconds).toBe(200));

    rerender({ id: "vid2" });

    expect(result.current).toEqual({
      status: "loading",
      durationSeconds: null,
    });
    durations = { vid1: 200, vid2: 150 };
    await waitFor(
      () =>
        expect(result.current).toEqual({
          status: "ready",
          durationSeconds: 150,
        }),
      { timeout: 3000 },
    );
  });

  test("going back to a video measured earlier loads and measures it again", async () => {
    durations = { vid1: 200 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string | null }) => useSongDuration(id),
      { initialProps: { id: "vid1" as string | null } },
    );
    await waitFor(() => expect(result.current.durationSeconds).toBe(200));
    rerender({ id: null });
    expect(result.current.status).toBe("idle");
    const before = FakePlayer.instances.reduce(
      (count, player) =>
        count + cuedIds(player).filter((id) => id === "vid1").length,
      0,
    );
    // The video changed on YouTube in the meantime
    durations = { vid1: 180 };

    rerender({ id: "vid1" });

    expect(result.current).toEqual({
      status: "loading",
      durationSeconds: null,
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        durationSeconds: 180,
      }),
    );
    const after = FakePlayer.instances.reduce(
      (count, player) =>
        count + cuedIds(player).filter((id) => id === "vid1").length,
      0,
    );
    expect(after).toBeGreaterThan(before);
  });

  test("A, then B, then A again re-measures A", async () => {
    durations = { vid1: 200, vid2: 150 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSongDuration(id),
      { initialProps: { id: "vid1" } },
    );
    await waitFor(() => expect(result.current.durationSeconds).toBe(200));
    rerender({ id: "vid2" });
    await waitFor(() => expect(result.current.durationSeconds).toBe(150));

    rerender({ id: "vid1" });

    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.durationSeconds).toBe(200));
  });

  test("a late length for the previous video is ignored", async () => {
    // vid1 would report 200 once cued; vid2 never reports a length
    durations = { vid1: 200 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSongDuration(id),
      { initialProps: { id: "vid1" } },
    );

    rerender({ id: "vid2" });
    await flush();
    await flush();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(result.current).toEqual({
      status: "loading",
      durationSeconds: null,
    });
  });

  test("a late error for the previous video is ignored", async () => {
    durations = { vid2: 150 };
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSongDuration(id),
      { initialProps: { id: "vid1" } },
    );
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    const first = playerFor("vid1");
    rerender({ id: "vid2" });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Only a player that was made for vid1 alone can still report for it
    if (first && !cuedIds(first).includes("vid2")) {
      act(() => first.fail(100));
    }

    expect(result.current).toEqual({ status: "ready", durationSeconds: 150 });
  });

  test("the 10 s timeout restarts for a new video", async () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useSongDuration(id),
      { initialProps: { id: "vid1" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(8_000));

    rerender({ id: "vid2" });
    await act(() => vi.advanceTimersByTimeAsync(8_000));

    expect(result.current.status).toBe("loading");
    await act(() => vi.advanceTimersByTimeAsync(3_000));
    expect(result.current.status).toBe("error");
  });
});

describe("R13: the measuring player", () => {
  test("is separate from the wall's player and never touches its playback", async () => {
    durations = { vid2: 150 };
    const wall = renderHook(() => useSongPlayer());
    await waitFor(() => expect(FakePlayer.instances).toHaveLength(1));
    const wallPlayer = FakePlayer.instances[0];
    await flush();
    act(() => wall.result.current.play("vid1", null));
    const wallCalls = wallPlayer.calls.length;

    const { result } = renderHook(() => useSongDuration("vid2"));

    await waitFor(() => expect(result.current.durationSeconds).toBe(150));
    expect(playerFor("vid2")).not.toBe(wallPlayer);
    expect(wallPlayer.calls.slice(wallCalls)).toEqual([]);
    expect(wall.result.current.playingVideoId).toBe("vid1");
  });

  test("is hidden and 1 × 1 px", async () => {
    const { unmount } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    const { options } = playerFor("vid1") as FakePlayer;

    expect(Number(options.width)).toBe(1);
    expect(Number(options.height)).toBe(1);
    unmount();
  });

  test("is destroyed on unmount", async () => {
    const { unmount } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    const player = playerFor("vid1") as FakePlayer;

    unmount();

    expect(player.calls.map(([name]) => name)).toContain("destroy");
  });

  test("unmounting while loading reports nothing afterwards", async () => {
    const { result, unmount } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(playerFor("vid1")).toBeDefined());
    unmount();
    durations = { vid1: 200 };
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(result.current.status).toBe("loading");
  });
});

describe("R13/R14: useSongDuration (white-box)", () => {
  test("an error after the length is known is ignored", async () => {
    durations = { vid1: 200 };
    const { result } = renderHook(() => useSongDuration("vid1"));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => playerFor("vid1")?.fail(150));

    expect(result.current).toEqual({ status: "ready", durationSeconds: 200 });
  });

  test("polling stops once the length is known", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSongDuration("vid1"));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    durations = { vid1: 200 };
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current.status).toBe("ready");
    const player = playerFor("vid1") as FakePlayer;
    const reads = player.durationReads;

    await act(() => vi.advanceTimersByTimeAsync(5_000));

    expect(player.durationReads).toBe(reads);
  });

  test("a second CUED while polling still ends in one ready", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSongDuration("vid1"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    const player = playerFor("vid1") as FakePlayer;
    act(() => player.emit(PlayerState.CUED));
    durations = { vid1: 30 };

    await act(() => vi.advanceTimersByTimeAsync(1_000));

    expect(result.current).toEqual({ status: "ready", durationSeconds: 30 });
  });

  test("other player states do not count as a length", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSongDuration("vid1"));
    await act(() => vi.advanceTimersByTimeAsync(500));
    const player = playerFor("vid1") as FakePlayer;
    const reads = player.durationReads;

    act(() => player.emit(PlayerState.BUFFERING));

    expect(player.durationReads).toBe(reads);
    expect(result.current.status).toBe("loading");
  });
});
