"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from "react";
import { Duration } from "luxon";
import { cn } from "@/lib/utils";
import {
  songClipMinSeconds,
  type NoteSong,
  type NoteSongClip,
} from "@/features/moments/models/requests";
import type { SongDuration } from "@/features/moments/hooks/use-song-duration";

// A fixed decorative pattern, the same for every song (not a real waveform).
const barHeights = [
  40, 58, 59, 52, 47, 55, 52, 67, 56, 69, 67, 67, 48, 53, 63, 65, 54, 50, 65,
  55, 62, 65, 58, 59, 59, 54, 57, 64, 50, 70, 64, 69, 74, 52, 68, 65, 73, 67,
  69, 58, 64, 55, 63, 58, 53, 38, 45, 42,
];

const sliderFocus = "focus-visible:outline-3 focus-visible:outline-[#4F70A8]";

// m:ss, or h:mm:ss from one hour on.
function formatClipTime(seconds: number) {
  return Duration.fromObject({ seconds }).toFormat(
    seconds >= 3600 ? "h:mm:ss" : "m:ss",
  );
}

const sameClip = (a: NoteSongClip, b: NoteSongClip) =>
  a.startSeconds === b.startSeconds && a.endSeconds === b.endSeconds;

// The clip the editor shows, previews and saves: none until the song's length is known; then the
// draft's clip if it fits the song, else the whole song. A song under 5 s gets none.
function effectiveSongClip(
  song: NoteSong | null,
  clip: NoteSongClip | null,
  duration: SongDuration,
): NoteSongClip | null {
  if (song === null || duration.status !== "ready") return null;
  const { durationSeconds } = duration;
  if (clip !== null && clip.endSeconds <= durationSeconds) return clip;
  return durationSeconds >= songClipMinSeconds
    ? { startSeconds: 0, endSeconds: durationSeconds }
    : null;
}

type Part = "window" | "start" | "end";

// Each slider's range keeps the clip inside the song and at least 5 s long.
function partRange(part: Part, clip: NoteSongClip, durationSeconds: number) {
  const { startSeconds: start, endSeconds: end } = clip;
  switch (part) {
    case "window":
      return { min: 0, max: durationSeconds - (end - start), now: start };
    case "start":
      return { min: 0, max: end - songClipMinSeconds, now: start };
    case "end":
      return {
        min: start + songClipMinSeconds,
        max: durationSeconds,
        now: end,
      };
  }
}

function withPartValue(
  part: Part,
  clip: NoteSongClip,
  durationSeconds: number,
  value: number,
): NoteSongClip {
  const { min, max } = partRange(part, clip, durationSeconds);
  const seconds = Math.min(max, Math.max(min, value));
  switch (part) {
    case "window":
      return {
        startSeconds: seconds,
        endSeconds: seconds + clip.endSeconds - clip.startSeconds,
      };
    case "start":
      return { startSeconds: seconds, endSeconds: clip.endSeconds };
    case "end":
      return { startSeconds: clip.startSeconds, endSeconds: seconds };
  }
}

function ClipHeader({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" className="mt-0.5 flex items-center gap-2">
      <span className="text-[11px] font-black tracking-[.08em] text-us-muted uppercase">
        Part that plays
      </span>
      {children}
    </div>
  );
}

// The bar track; `isPlayed` gets each bar's center as a 0–1 fraction of the song.
function ClipTrack({
  isPlayed,
  className,
  children,
  ref,
}: {
  isPlayed?: (center: number) => boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        "relative flex h-16 touch-none items-center gap-0.5 rounded-[14px] bg-us-subtle px-0.5 select-none max-[900px]:h-13",
        className,
      )}
    >
      {barHeights.map((height, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "min-w-0 flex-1 rounded-[2px]",
            isPlayed?.((index + 0.5) / barHeights.length)
              ? "bg-[#4F70A8]"
              : "bg-[rgba(31,43,66,.16)] dark:bg-[rgba(230,236,246,.22)]",
          )}
          style={{ height: `${height}%` }}
        />
      ))}
      {children}
    </div>
  );
}

interface Drag {
  part: Part;
  pointerId: number;
  startX: number;
  startClip: NoteSongClip;
  clip: NoteSongClip;
}

const keySteps: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -5,
  PageUp: 5,
};

function SongClipPicker({
  durationSeconds,
  clip,
  onChange,
  onCommit,
}: {
  durationSeconds: number;
  clip: NoteSongClip;
  onChange: (clip: NoteSongClip) => void;
  onCommit: (clip: NoteSongClip) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [draggingPart, setDraggingPart] = useState<Part | null>(null);
  const { startSeconds: start, endSeconds: end } = clip;
  const length = end - start;
  const percent = (seconds: number) => `${(seconds / durationSeconds) * 100}%`;

  const sliderProps = (part: Part, label: string, valueText: string) => {
    const { min, max, now } = partRange(part, clip, durationSeconds);
    return {
      role: "slider",
      tabIndex: 0,
      "aria-label": label,
      "aria-valuemin": min,
      "aria-valuemax": max,
      "aria-valuenow": now,
      "aria-valuetext": valueText,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          part,
          pointerId: event.pointerId,
          startX: event.clientX,
          startClip: clip,
          clip,
        };
        setDraggingPart(part);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const current = drag.current;
        const width = trackRef.current?.getBoundingClientRect().width ?? 0;
        if (current?.pointerId !== event.pointerId || width === 0) return;
        const deltaSeconds = Math.round(
          ((event.clientX - current.startX) / width) * durationSeconds,
        );
        const next = withPartValue(
          part,
          current.startClip,
          durationSeconds,
          partRange(part, current.startClip, durationSeconds).now +
            deltaSeconds,
        );
        if (sameClip(next, current.clip)) return;
        current.clip = next;
        onChange(next);
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => endDrag(event, true),
      onPointerCancel: (event: PointerEvent<HTMLElement>) =>
        endDrag(event, false),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        const range = partRange(part, clip, durationSeconds);
        const value =
          event.key === "Home"
            ? range.min
            : event.key === "End"
              ? range.max
              : event.key in keySteps
                ? range.now + keySteps[event.key]
                : null;
        if (value === null) return;
        event.preventDefault();
        const next = withPartValue(part, clip, durationSeconds, value);
        if (!sameClip(next, clip)) onChange(next);
        onCommit(next);
      },
    };
  };

  // A release commits the dragged clip; a cancelled pointer still keeps what onChange showed.
  const endDrag = (event: PointerEvent<HTMLElement>, release: boolean) => {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDraggingPart(null);
    if (release && !sameClip(current.clip, current.startClip)) {
      onCommit(current.clip);
    }
  };

  const handle = (part: "start" | "end", label: string, valueText: string) => (
    <span
      {...sliderProps(part, label, valueText)}
      className={cn(
        "absolute inset-y-0 z-2 flex w-6 cursor-ew-resize items-center rounded-[4px]",
        // Hit areas point outward (20 px out, 4 px in) so a 5 s clip's handles never overlap;
        // the 8 px grip, flush with the inner side, stays centered on its edge.
        part === "start" ? "-ml-5 justify-end" : "-ml-1 justify-start",
        sliderFocus,
      )}
      style={{ left: percent(part === "start" ? start : end) }}
    >
      <span className="h-[29px] w-2 rounded-[4px] bg-[#4F70A8] shadow-[0_0_0_2px_var(--us-panel)] max-[900px]:h-[23px]" />
    </span>
  );

  return (
    <>
      <ClipHeader>
        <b className="ml-auto text-[15px] font-black text-us-ink tabular-nums">
          {formatClipTime(start)} – {formatClipTime(end)}
        </b>
        <span className="rounded-full bg-us-subtle px-[9px] py-[3px] text-[12.5px] font-black text-[#5B7DB6]">
          {length}s
        </span>
      </ClipHeader>

      <ClipTrack
        ref={trackRef}
        isPlayed={(center) =>
          center * durationSeconds >= start && center * durationSeconds <= end
        }
      >
        <div
          {...sliderProps(
            "window",
            "Move the part that plays",
            `${formatClipTime(start)} to ${formatClipTime(end)}, ${length} seconds`,
          )}
          className={cn(
            "absolute inset-y-[5px] z-1 rounded-[9px] bg-[rgba(79,112,168,.14)] shadow-[inset_0_0_0_2.5px_#4F70A8]",
            draggingPart === "window" ? "cursor-grabbing" : "cursor-grab",
            sliderFocus,
          )}
          style={{ left: percent(start), width: percent(length) }}
        />
        {handle(
          "start",
          "Start of the part",
          `Starts at ${formatClipTime(start)}, ${length} seconds long`,
        )}
        {handle(
          "end",
          "End of the part",
          `Ends at ${formatClipTime(end)}, ${length} seconds long`,
        )}
      </ClipTrack>

      <div
        aria-hidden="true"
        className="-mt-1 flex justify-between gap-2 text-[11.5px] font-bold whitespace-nowrap text-us-muted tabular-nums"
      >
        <span>{formatClipTime(0)}</span>
        <span>{formatClipTime(durationSeconds)}</span>
      </div>
    </>
  );
}

export {
  SongClipPicker,
  ClipHeader,
  ClipTrack,
  effectiveSongClip,
  formatClipTime,
};
