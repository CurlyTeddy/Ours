"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteSongClip } from "@/features/moments/models/requests";
import { mountHiddenPlayer } from "@/features/moments/youtube-player";

interface PlayRequest {
  videoId: string;
  clip: NoteSongClip | null;
}

// A clip plays only its part; without one loadVideoById starts from 0:00 and runs to the end.
function load(player: YT.Player, { videoId, clip }: PlayRequest) {
  if (clip) {
    player.loadVideoById({
      videoId,
      startSeconds: clip.startSeconds,
      endSeconds: clip.endSeconds,
    });
  } else {
    player.loadVideoById(videoId);
  }
}

// One hidden, audio-only player for the whole wall: starting a song stops the previous one.
function useSongPlayer() {
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  // The song that should be playing; a play() before the player is ready starts once it is.
  const requested = useRef<PlayRequest | null>(null);

  useEffect(() => {
    const unmount = mountHiddenPlayer({
      onReady: (event) => {
        playerRef.current = event.target;
        if (requested.current !== null) {
          load(event.target, requested.current);
        }
      },
      onStateChange: (event) => {
        if (event.data !== window.YT?.PlayerState.ENDED) return;
        // A clip loops until stop() or another play() replaces it.
        if (requested.current?.clip) {
          load(event.target, requested.current);
          return;
        }
        requested.current = null;
        setPlayingVideoId(null);
      },
    });
    return () => {
      playerRef.current = null;
      unmount();
    };
  }, []);

  const play = useCallback((videoId: string, clip: NoteSongClip | null) => {
    requested.current = { videoId, clip };
    setPlayingVideoId(videoId);
    if (playerRef.current) load(playerRef.current, requested.current);
  }, []);

  const stop = useCallback(() => {
    requested.current = null;
    setPlayingVideoId(null);
    playerRef.current?.stopVideo();
  }, []);

  return { play, stop, playingVideoId };
}

export { useSongPlayer };
