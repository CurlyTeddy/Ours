import type { PointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { Note } from "@/features/moments/models/responses";
import { NotePaper } from "@/features/moments/components/note-paper";
import { Vinyl } from "@/features/moments/components/vinyl";
import { noteColorStyles } from "@/features/moments/components/note-colors";

type NoteMotion =
  | "idle"
  | "pressing"
  | "dragging"
  | "playing"
  // the vinyl tucks back for 360ms after a song stops
  | "closing";

interface WallNoteProps {
  note: Note;
  viewerId: string | undefined;
  left: number;
  top: number;
  rotation: number;
  scale: number;
  zIndex: number;
  motion: NoteMotion;
  // map mode: no place to sit at, or on the far side of the globe
  away: boolean;
  behind: boolean;
  // map mode while the globe moves: follow it without the slow left/top glide
  tracking: boolean;
  showBubble: boolean;
  onPointerDown: (note: Note, event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (note: Note, event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (cancelled: boolean) => void;
  onOpen: (note: Note) => void;
}

function noteLabel(note: Note) {
  const text = note.text.trim().replace(/\n/g, " ") || "Empty note";
  const place = note.place ? `, at ${note.place.name}` : "";
  const song = note.song ? `. Hold to play ${note.song.title}` : "";
  return `${text}, by ${note.author.name}${place}${song}. Press to edit`;
}

function noteTransform(motion: NoteMotion, rotation: number, scale: number) {
  switch (motion) {
    case "playing":
      return `rotate(0deg) translateY(-8px) scale(${scale * 1.06})`;
    case "dragging":
      return `rotate(${rotation}deg) scale(1.05)`;
    case "pressing":
      return `rotate(${rotation}deg) scale(${scale * 0.97})`;
    default:
      return `rotate(${rotation}deg) scale(${scale})`;
  }
}

function WallNote({
  note,
  viewerId,
  left,
  top,
  rotation,
  scale,
  zIndex,
  motion,
  away,
  behind,
  tracking,
  showBubble,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onOpen,
}: WallNoteProps) {
  const hex = noteColorStyles[note.color].hex;
  const lifted = motion === "playing" || motion === "dragging";

  return (
    <div
      data-note=""
      className={cn(
        "us-paper absolute size-52.5 origin-bottom touch-none select-none [-webkit-touch-callout:none]",
        motion === "dragging"
          ? "transition-none"
          : tracking
            ? "transition-[transform,opacity] duration-300 ease-us"
            : "transition-[transform,left,top,opacity] duration-[300ms,750ms,750ms,350ms] ease-[cubic-bezier(.2,.8,.2,1),cubic-bezier(.3,.9,.25,1),cubic-bezier(.3,.9,.25,1),ease]",
        away && "pointer-events-none opacity-0",
        behind && "invisible",
      )}
      style={{
        left: `${left.toFixed(1)}px`,
        top: `${top.toFixed(1)}px`,
        zIndex,
        transform: noteTransform(motion, rotation, scale),
      }}
    >
      {motion === "playing" || motion === "closing" ? (
        <div
          className={cn(
            "absolute top-[7%] left-[7%] z-0 size-[86%]",
            motion === "playing" ? "animate-peek-out" : "animate-peek-in",
          )}
        >
          <Vinyl
            labelColor={note.photoUrl ? "#D3E0F4" : hex}
            spinning
            className="[animation-delay:.4s]"
          />
        </div>
      ) : null}

      <button
        type="button"
        aria-label={noteLabel(note)}
        tabIndex={away || behind ? -1 : 0}
        className={cn(
          "relative z-1 flex size-full cursor-grab flex-col overflow-hidden rounded-[3px_3px_12px_3px] text-left transition-shadow duration-250 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-[18%] before:bg-white/30 before:content-[''] focus-visible:outline-3 focus-visible:outline-offset-5 focus-visible:outline-[#4F70A8]",
          lifted
            ? "shadow-[0_2px_2px_rgba(31,43,66,.08),0_34px_40px_-22px_rgba(31,43,66,.6)]"
            : "shadow-[0_1px_1px_rgba(31,43,66,.08),0_16px_22px_-16px_rgba(31,43,66,.55)]",
          motion === "dragging" && "cursor-grabbing",
          !note.photoUrl && note.pattern === "grid" && "note-grid",
          !note.photoUrl && note.pattern === "lines" && "note-lines",
        )}
        style={{ backgroundColor: hex }}
        onPointerDown={(event) => onPointerDown(note, event)}
        onPointerMove={(event) => onPointerMove(note, event)}
        onPointerUp={() => onPointerUp(false)}
        onPointerCancel={() => onPointerUp(true)}
        onClick={() => onOpen(note)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <NotePaper note={note} viewerId={viewerId} />
      </button>

      {note.photoUrl ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-2.75 left-1/2 z-2 -ml-[19%] h-6 w-[38%] -rotate-4 bg-[rgba(196,212,238,.82)]"
        />
      ) : null}

      {motion === "playing" && note.song ? (
        <span className="sr-only" role="status">
          Playing {note.song.title}
        </span>
      ) : null}

      {showBubble ? (
        <div
          role="status"
          className="pointer-events-none absolute top-[calc(100%+14px)] left-1/2 z-3 animate-bubble rounded-full bg-[#1F2B42] px-3.5 py-2.25 text-[13px] font-extrabold whitespace-nowrap text-white"
        >
          No song yet · tap to add one
        </div>
      ) : null}
    </div>
  );
}

export { WallNote };
export type { NoteMotion };
