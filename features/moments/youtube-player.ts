"use client";

// @types/youtube types the API's `YT` global but not its window properties.
declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const apiScriptId = "youtube-iframe-api";

// Resolves once window.YT.Player exists; the script tag is added at most once per page.
function loadYouTubeApi() {
  return new Promise<typeof YT.Player>((resolve) => {
    const Player = window.YT?.Player;
    if (typeof Player === "function") {
      resolve(Player);
      return;
    }

    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      if (window.YT?.Player) resolve(window.YT.Player);
    };

    if (!document.getElementById(apiScriptId)) {
      const script = document.createElement("script");
      script.id = apiScriptId;
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      document.head.append(script);
    }
  });
}

// A hidden 1 × 1 px, audio-only player; the returned function destroys it.
function mountHiddenPlayer(events: YT.Events) {
  let disposed = false;
  let player: YT.Player | null = null;
  const host = document.createElement("div");
  const frame = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "1px",
    height: "1px",
    opacity: "0",
    pointerEvents: "none",
    overflow: "hidden",
  });
  host.append(frame);
  document.body.append(host);

  void loadYouTubeApi().then((Player) => {
    if (disposed) return;
    player = new Player(frame, {
      height: 1,
      width: 1,
      playerVars: {
        controls: 0,
        disablekb: 1,
        origin: window.location.origin,
        playsinline: 1,
        rel: 0,
      },
      events,
    });
  });

  return () => {
    disposed = true;
    player?.destroy();
    host.remove();
  };
}

export { loadYouTubeApi, mountHiddenPlayer };
