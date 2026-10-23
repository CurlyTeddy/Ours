"use client";

import { useSyncExternalStore } from "react";

// False on the server and during hydration, so server markup matches the first client render.
function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export { useMediaQuery };
