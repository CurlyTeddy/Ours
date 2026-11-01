"use client";

import { useEffect, useState } from "react";
import { mountHiddenPlayer } from "@/features/moments/youtube-player";

type SongDuration =
  | { status: "ready"; durationSeconds: number }
  | { status: "idle" | "loading" | "error"; durationSeconds: null };

const timeoutMs = 10_000;
const pollMs = 250;

// The song's length from its own hidden player, so measuring never interrupts wall playback.
function useSongDuration(videoId: string | null): SongDuration {
  // The current load's outcome; null while it is still measuring.
  const [result, setResult] = useState<SongDuration | null>(null);
  // Any change of video, even back to one measured before, starts a fresh load.
  const [loadedVideoId, setLoadedVideoId] = useState(videoId);
  if (loadedVideoId !== videoId) {
    setLoadedVideoId(videoId);
    setResult(null);
  }

  useEffect(() => {
    if (videoId === null) return;
    let done = false;
    let poll: number | undefined;

    const finish = (durationSeconds: number | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      setResult(
        durationSeconds === null
          ? { status: "error", durationSeconds: null }
          : { status: "ready", durationSeconds },
      );
    };
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    const readDuration = (player: YT.Player) => {
      const duration = player.getDuration();
      if (duration > 0) finish(Math.floor(duration));
      return duration > 0;
    };

    const unmount = mountHiddenPlayer({
      onReady: (event) => event.target.cueVideoById(videoId),
      onStateChange: (event) => {
        const cued = event.data === window.YT?.PlayerState.CUED;
        if (done || !cued || poll !== undefined) return;
        // getDuration() can still be 0 right after cueing.
        if (!readDuration(event.target)) {
          poll = window.setInterval(() => readDuration(event.target), pollMs);
        }
      },
      onError: () => finish(null),
    });

    // A late result from this load can't land once the video changes.
    return () => {
      done = true;
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      unmount();
    };
  }, [videoId]);

  if (videoId === null) return { status: "idle", durationSeconds: null };
  return result ?? { status: "loading", durationSeconds: null };
}

export { useSongDuration };
export type { SongDuration };
