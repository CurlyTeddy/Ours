"use client";

import { useState } from "react";
import ky from "ky";
import useSWR from "swr";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { Music, Pause, Play, Search, X } from "lucide-react";
import { getErrorMessage } from "@/lib/error";
import type { Note, NoteSong } from "@/features/moments/models/responses";
import { Vinyl } from "@/features/moments/components/vinyl";
import { noteColorStyles } from "@/features/moments/components/note-colors";

const fieldLabel =
  "text-xs font-black tracking-[.12em] text-us-muted uppercase max-[900px]:text-[11px]";

// Songs already stuck on notes, one per video, newest note first.
function sharedSongs(notes: Note[]) {
  const seen = new Set<string>();
  return notes
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((note) => {
      if (!note.song || seen.has(note.song.videoId)) return [];
      seen.add(note.song.videoId);
      return [{ song: note.song, hex: noteColorStyles[note.color].hex }];
    });
}

function SongRow({
  song,
  hex,
  onPick,
}: {
  song: NoteSong;
  hex: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-1 text-left hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
    >
      <span
        aria-hidden="true"
        className="us-paper flex size-8 flex-none items-center justify-center rounded-[4px] text-us-ink"
        style={{ background: hex }}
      >
        <Music size={14} strokeWidth={2.4} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="truncate text-sm font-extrabold text-us-ink">
          {song.title}
        </span>
        <span className="truncate text-xs font-bold text-us-muted">
          {song.channelTitle}
        </span>
      </span>
    </button>
  );
}

function SongField({
  song,
  labelColor,
  notes,
  previewing,
  onChange,
  onTogglePreview,
}: {
  song: NoteSong | null;
  labelColor: string;
  notes: Note[];
  previewing: boolean;
  onChange: (song: NoteSong | null) => void;
  onTogglePreview: () => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query.trim(), 300);
  const { data: results } = useSWR(
    debouncedQuery
      ? `/api/music/search?q=${encodeURIComponent(debouncedQuery)}`
      : null,
    async (url: string) =>
      (await ky.get(url, { retry: 0 }).json<{ results: NoteSong[] }>()).results,
    {
      shouldRetryOnError: false,
      onError: async (error: unknown) => {
        toast.error(await getErrorMessage(error, "Failed to search YouTube."));
      },
    },
  );

  const pick = (picked: NoteSong) => {
    onChange(picked);
    setQuery("");
  };

  const shared = query.trim() || song ? [] : sharedSongs(notes);

  return (
    <div className="flex flex-col gap-2.5 max-[900px]:gap-2">
      <span className={fieldLabel}>Song · plays while held</span>

      {song ? (
        <div className="flex items-center gap-3 rounded-[18px] bg-us-subtle py-2 pr-2 pl-3 max-[900px]:gap-2.5 max-[900px]:pl-2.5">
          <div className="us-paper size-9.5 flex-none">
            <Vinyl labelColor={labelColor} spinning={previewing} />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[15px] font-black text-us-ink">
              {song.title}
            </span>
            <span className="truncate text-xs font-bold text-us-muted">
              {song.channelTitle}
            </span>
          </div>
          <button
            type="button"
            aria-label={previewing ? "Pause preview" : "Preview song"}
            onClick={onTogglePreview}
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full bg-[#4F70A8] text-white hover:bg-[#3F5F96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8]"
          >
            {previewing ? (
              <Pause size={16} strokeWidth={3.2} aria-hidden="true" />
            ) : (
              <Play
                size={16}
                fill="currentColor"
                strokeWidth={0}
                aria-hidden="true"
              />
            )}
          </button>
          <button
            type="button"
            aria-label="Remove song"
            onClick={() => onChange(null)}
            className="flex size-11 flex-none cursor-pointer items-center justify-center rounded-full text-us-muted hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
          >
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <label className="sr-only" htmlFor="note-song-search">
        Search YouTube Music
      </label>
      <div className="flex h-11 items-center gap-2 rounded-[14px] bg-us-surface px-3.5 text-us-muted shadow-[inset_0_0_0_1px_var(--us-field-line)] focus-within:shadow-[inset_0_0_0_2px_#4F70A8]">
        <Search size={17} strokeWidth={2.2} aria-hidden="true" />
        <input
          id="note-song-search"
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            song ? "Swap song · Search YouTube Music…" : "Search YouTube Music…"
          }
          className="min-w-0 flex-1 border-0 bg-transparent text-base font-bold text-us-ink outline-none min-[901px]:text-sm"
        />
      </div>

      {query.trim() && results && debouncedQuery === query.trim() ? (
        <>
          <span className="text-xs font-bold text-us-muted">
            {results.length ? "Results" : `Nothing found for “${query.trim()}”`}
          </span>
          <div className="-mt-1 flex flex-col gap-0.5">
            {results.map((result) => (
              <SongRow
                key={result.videoId}
                song={result}
                hex={labelColor}
                onPick={() => pick(result)}
              />
            ))}
          </div>
        </>
      ) : null}

      {shared.length ? (
        <>
          <span className="text-xs font-bold text-us-muted">
            From your shared list
          </span>
          <div className="-mt-1 flex flex-col gap-0.5">
            {shared.map(({ song: sharedSong, hex }) => (
              <SongRow
                key={sharedSong.videoId}
                song={sharedSong}
                hex={hex}
                onPick={() => pick(sharedSong)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export { SongField, fieldLabel };
