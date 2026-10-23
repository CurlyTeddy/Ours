"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const springMotion =
  "transition-transform ease-us-spring motion-reduce:duration-10! motion-reduce:delay-0!";

// Sun and moon share one masked circle: the bite slides in, the rays spin away, two stars pop.
function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is unknown on the server, so the label waits for the client.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex size-11 cursor-pointer touch-manipulation items-center justify-center rounded-full bg-us-surface text-[#B8740F] shadow-[inset_0_0_0_1px_var(--us-hair)] transition-[background-color,color,scale] duration-[450ms,450ms,150ms] select-none hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#4F70A8] active:scale-[.88] dark:text-[#F3D98B]"
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={cn(
          springMotion,
          "origin-[12px_12px] overflow-visible duration-750 dark:-rotate-30",
        )}
      >
        <defs>
          <mask
            id="theme-toggle-bite"
            maskUnits="userSpaceOnUse"
            x="-4"
            y="-4"
            width="32"
            height="32"
          >
            <rect x="-4" y="-4" width="32" height="32" fill="#FFFFFF" />
            <circle
              cx="16.5"
              cy="7.5"
              r="5.5"
              fill="#000000"
              className="translate-x-2.25 -translate-y-2.25 transition-transform duration-550 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:duration-10! dark:translate-0"
            />
          </mask>
        </defs>
        <g
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={cn(
            springMotion,
            "origin-[12px_12px] transition-[rotate,scale,opacity] duration-[600ms,600ms,350ms] dark:scale-20 dark:rotate-100 dark:opacity-0",
          )}
        >
          <line x1="12" y1="3.8" x2="12" y2="1.8" />
          <line x1="17.8" y1="6.2" x2="19.2" y2="4.8" />
          <line x1="20.2" y1="12" x2="22.2" y2="12" />
          <line x1="17.8" y1="17.8" x2="19.2" y2="19.2" />
          <line x1="12" y1="20.2" x2="12" y2="22.2" />
          <line x1="6.2" y1="17.8" x2="4.8" y2="19.2" />
          <line x1="3.8" y1="12" x2="1.8" y2="12" />
          <line x1="6.2" y1="6.2" x2="4.8" y2="4.8" />
        </g>
        <circle
          cx="12"
          cy="12"
          r="5"
          mask="url(#theme-toggle-bite)"
          fill="currentColor"
          className={cn(
            springMotion,
            "origin-[12px_12px] duration-600 dark:scale-160",
          )}
        />
        {[
          { cx: 20.6, cy: 9.4, r: 1.05, delay: "dark:delay-300" },
          { cx: 17.6, cy: 2.8, r: 0.75, delay: "dark:delay-[420ms]" },
        ].map(({ cx, cy, r, delay }) => (
          <circle
            key={cx}
            cx={cx}
            cy={cy}
            r={r}
            fill="currentColor"
            className={cn(
              "origin-center scale-0 opacity-0 transition-[opacity,scale] duration-[200ms,400ms] ease-us-spring [transform-box:fill-box] motion-reduce:delay-0! motion-reduce:duration-10! dark:scale-100 dark:opacity-100",
              delay,
            )}
          />
        ))}
      </svg>
    </button>
  );
}

export { ThemeToggle };
