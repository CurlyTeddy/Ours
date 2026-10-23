import { MapPin, Music } from "lucide-react";
import type { Note } from "@/features/moments/models/responses";
import { AuthorBadge } from "@/features/moments/components/author-badge";

// "yyyy-MM-dd" reads as "yyyy.MM.dd" on paper.
const formatNoteDate = (date: string | null) =>
  date?.replaceAll("-", ".") ?? "";

const shortTitle = (title: string) =>
  title.length > 12 ? `${title.slice(0, 11)}…` : title;

const badge =
  "inline-flex items-center rounded-full px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-us-ink";

// What sits on a 210px wall note: a photo with a caption strip, or handwriting on paper.
function NotePaper({
  note,
  viewerId,
}: {
  note: Note;
  viewerId: string | undefined;
}) {
  const songBadge = note.song ? (
    <span className={`${badge} gap-1`}>
      <Music size={12} strokeWidth={2.4} aria-hidden="true" />
      {shortTitle(note.song.title)}
    </span>
  ) : null;

  if (note.photoUrl) {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
        <img
          src={note.photoUrl}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
        <span className="absolute inset-x-[9%] bottom-[8%] flex -rotate-[1.5deg] items-center justify-between gap-1.5 rounded-[3px] bg-[#FFFDF7] py-1.25 pr-2 pl-2.5 shadow-[0_6px_12px_-8px_rgba(31,43,66,.6)]">
          <span className="truncate font-hand text-[21px] leading-[1.15] font-bold text-us-ink">
            {note.text}
          </span>
          <AuthorBadge
            author={note.author}
            viewerId={viewerId}
            className="size-5 text-[10px]"
          />
        </span>
        <span className="absolute inset-x-[7%] top-[8%] flex gap-1.5">
          {note.place ? (
            <span
              className={`${badge} min-w-0 gap-0.75 bg-[rgba(255,253,247,.92)]`}
            >
              <MapPin size={11} strokeWidth={2.6} aria-hidden="true" />
              <span className="truncate">{note.place.name}</span>
            </span>
          ) : null}
          {songBadge ? (
            <span className="ml-auto rounded-full bg-[rgba(255,253,247,.92)]">
              {songBadge}
            </span>
          ) : null}
        </span>
      </>
    );
  }

  return (
    <span className="relative flex size-full flex-col px-[17.85px] pt-[17.85px] pb-[15.75px]">
      <span className="flex min-h-5.5 items-center justify-between gap-1.5">
        <span className="font-hand text-[18.48px] leading-none font-bold text-us-muted">
          {formatNoteDate(note.date)}
        </span>
        {songBadge ? (
          <span className="rounded-full bg-white/70 shadow-[inset_0_0_0_1px_var(--us-hair)]">
            {songBadge}
          </span>
        ) : null}
      </span>
      <span className="flex min-h-0 flex-1 items-center overflow-hidden font-hand text-[30.45px] leading-[1.18] font-bold wrap-anywhere whitespace-pre-line text-us-ink">
        {note.text}
      </span>
      <span className="flex items-center gap-1.5 text-[11px] font-extrabold whitespace-nowrap text-us-muted">
        <AuthorBadge
          author={note.author}
          viewerId={viewerId}
          className="size-5 text-[10px]"
        />
        <span className="truncate">{note.author.name}</span>
        {note.place ? (
          <span className="ml-auto inline-flex min-w-0 items-center gap-0.5 text-us-ink">
            <MapPin size={11} strokeWidth={2.6} aria-hidden="true" />
            <span className="truncate">{note.place.name}</span>
          </span>
        ) : null}
      </span>
    </span>
  );
}

export { NotePaper, formatNoteDate, shortTitle };
