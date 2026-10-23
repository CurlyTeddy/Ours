import { afterEach, describe, expect, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSongPlayer } from "@/features/moments/hooks/use-song-player";

const apiSrc = "https://www.youtube.com/iframe_api";
const apiScripts = () =>
  Array.from(document.querySelectorAll("script")).filter((script) =>
    script.src.startsWith(apiSrc),
  );

const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
};

interface PlayerOptions {
  events?: {
    onReady?: (event: { target: FakePlayer }) => void;
    onStateChange?: (event: { data: number; target: FakePlayer }) => void;
  };
}

// Stands in for YT.Player: ready on the next tick, reports PLAYING after a load like the real one
class FakePlayer {
  static instances: FakePlayer[] = [];
  calls: [string, unknown[]][] = [];
  constructor(
    public element: unknown,
    public options: PlayerOptions,
  ) {
    FakePlayer.instances.push(this);
    setTimeout(() => options.events?.onReady?.({ target: this }), 0);
  }
  private record(name: string, args: unknown[], state?: number) {
    this.calls.push([name, args]);
    if (state !== undefined) {
      setTimeout(
        () =>
          this.options.events?.onStateChange?.({ data: state, target: this }),
        0,
      );
    }
  }
  loadVideoById = (...args: unknown[]) =>
    this.record("loadVideoById", args, PlayerState.PLAYING);
  cueVideoById = (...args: unknown[]) =>
    this.record("cueVideoById", args, PlayerState.CUED);
  playVideo = () => this.record("playVideo", [], PlayerState.PLAYING);
  pauseVideo = () => this.record("pauseVideo", [], PlayerState.PAUSED);
  stopVideo = () => this.record("stopVideo", [], PlayerState.UNSTARTED);
  seekTo = (...args: unknown[]) => this.record("seekTo", args);
  mute = () => this.record("mute", []);
  unMute = () => this.record("unMute", []);
  setVolume = (...args: unknown[]) => this.record("setVolume", args);
  getPlayerState = () => PlayerState.UNSTARTED;
  getCurrentTime = () => 0;
  getDuration = () => 200;
  getIframe = () => document.createElement("iframe");
  destroy = () => this.record("destroy", []);
}

const allCalls = () => FakePlayer.instances.flatMap((player) => player.calls);
// The video id may go in as a string or as { videoId }
const loadedIds = () =>
  allCalls()
    .filter(([name]) => name === "loadVideoById" || name === "cueVideoById")
    .map(([, [arg]]) =>
      typeof arg === "string" ? arg : (arg as { videoId: string }).videoId,
    );
const installYouTube = () => {
  (window as unknown as { YT: unknown }).YT = {
    Player: FakePlayer,
    PlayerState,
    loaded: 1,
  };
  (
    window as unknown as { onYouTubeIframeAPIReady?: () => void }
  ).onYouTubeIframeAPIReady?.();
};

afterEach(() => {
  FakePlayer.instances = [];
});

describe("R12: loading the YouTube IFrame API", () => {
  test("adds the iframe_api script once, however many players mount", () => {
    const first = renderHook(() => useSongPlayer());
    const second = renderHook(() => useSongPlayer());

    expect(apiScripts()).toHaveLength(1);
    expect(first.result.current.playingVideoId).toBeNull();

    second.unmount();
    renderHook(() => useSongPlayer());
    expect(apiScripts()).toHaveLength(1);
  });
});

describe("R11/R12: useSongPlayer", () => {
  test("nothing plays at first", () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    expect(result.current.playingVideoId).toBeNull();
  });

  test("play loads that video and reports it as playing", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    act(() => result.current.play("vid1"));

    await waitFor(() => expect(result.current.playingVideoId).toBe("vid1"));
    await waitFor(() => expect(loadedIds()).toContain("vid1"));
  });

  test("starting another song replaces the first; one player only", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    act(() => result.current.play("vid1"));
    await waitFor(() => expect(result.current.playingVideoId).toBe("vid1"));
    act(() => result.current.play("vid2"));

    await waitFor(() => expect(result.current.playingVideoId).toBe("vid2"));
    await waitFor(() => expect(loadedIds().at(-1)).toBe("vid2"));
    expect(FakePlayer.instances).toHaveLength(1);
  });

  test("stop stops the player and clears the playing song", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    act(() => result.current.play("vid1"));
    await waitFor(() => expect(result.current.playingVideoId).toBe("vid1"));
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.playingVideoId).toBeNull());
    expect(
      allCalls().some(
        ([name]) => name === "stopVideo" || name === "pauseVideo",
      ),
    ).toBe(true);
  });

  test("stop with nothing playing is harmless", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    act(() => result.current.stop());

    expect(result.current.playingVideoId).toBeNull();
  });

  test("a play before the player is ready still plays once it is", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());

    act(() => result.current.play("early"));

    await waitFor(() => expect(loadedIds()).toContain("early"));
    await waitFor(() => expect(result.current.playingVideoId).toBe("early"));
  });
});

describe("R12: player lifecycle (white-box)", () => {
  test("a song that ends clears the playing song", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());
    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    act(() => result.current.play("vid1"));
    await waitFor(() => expect(result.current.playingVideoId).toBe("vid1"));

    act(() =>
      FakePlayer.instances[0].options.events?.onStateChange?.({
        data: PlayerState.ENDED,
        target: FakePlayer.instances[0],
      }),
    );

    expect(result.current.playingVideoId).toBeNull();
  });

  test("other states keep the song playing", async () => {
    installYouTube();
    const { result } = renderHook(() => useSongPlayer());
    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    act(() => result.current.play("vid1"));

    act(() =>
      FakePlayer.instances[0].options.events?.onStateChange?.({
        data: PlayerState.BUFFERING,
        target: FakePlayer.instances[0],
      }),
    );

    expect(result.current.playingVideoId).toBe("vid1");
  });

  test("unmounting destroys the player and removes its hidden host", async () => {
    installYouTube();
    const { unmount } = renderHook(() => useSongPlayer());
    await waitFor(() => expect(FakePlayer.instances.length).toBeGreaterThan(0));
    const host = FakePlayer.instances[0].element as HTMLElement;
    expect(document.body.contains(host)).toBe(true);
    expect(host.parentElement?.getAttribute("aria-hidden")).toBe("true");

    unmount();

    expect(FakePlayer.instances[0].calls.map(([name]) => name)).toContain(
      "destroy",
    );
    expect(document.body.contains(host)).toBe(false);
  });

  test("waits for onYouTubeIframeAPIReady and keeps an earlier handler", async () => {
    const win = window as unknown as {
      YT?: unknown;
      onYouTubeIframeAPIReady?: () => void;
    };
    delete win.YT;
    const earlier = vi.fn();
    win.onYouTubeIframeAPIReady = earlier;
    const { result } = renderHook(() => useSongPlayer());
    act(() => result.current.play("late"));
    expect(FakePlayer.instances).toHaveLength(0);

    win.YT = { Player: FakePlayer, PlayerState, loaded: 1 };
    act(() => win.onYouTubeIframeAPIReady?.());

    expect(earlier).toHaveBeenCalled();
    await waitFor(() => expect(loadedIds()).toContain("late"));
  });

  test("unmounting before the API loads creates no player", async () => {
    const win = window as unknown as {
      YT?: unknown;
      onYouTubeIframeAPIReady?: () => void;
    };
    delete win.YT;
    const { unmount } = renderHook(() => useSongPlayer());
    unmount();

    win.YT = { Player: FakePlayer, PlayerState, loaded: 1 };
    act(() => win.onYouTubeIframeAPIReady?.());
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(FakePlayer.instances).toHaveLength(0);
  });
});
