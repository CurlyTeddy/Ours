import type { SVGProps } from "react";

// The design's rounded heart, used for pins, the calendar's big day and the floating hearts.
function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 21s-7.5-4.6-7.5-10.4A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 7.5 2.6C19.5 16.4 12 21 12 21z"
        fill="currentColor"
      />
    </svg>
  );
}

export { HeartIcon };
