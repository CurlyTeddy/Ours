"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import ky from "ky";
import { toast } from "sonner";
import { ImageIcon, MapPin, Music, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/error";
import { isHeic } from "@/lib/decode-image";
import type { ImageUpload } from "@/lib/image-upload";
import { useMediaQuery } from "@/hooks/use-media-query";
import AlertDialogButton from "@/components/ui/alert-dialog-button";
import { ImageCropDialog } from "@/components/ui/image-crop-dialog";
import {
  noteColors,
  notePatterns,
  type NoteColor,
  type NoteCreateRequest,
  type NotePattern,
  type NoteSaveRequest,
} from "@/features/moments/models/requests";
import type {
  Note,
  NoteSaveResponse,
} from "@/features/moments/models/responses";
import { AuthorBadge } from "@/features/moments/components/author-badge";
import { Vinyl } from "@/features/moments/components/vinyl";
import { noteColorStyles } from "@/features/moments/components/note-colors";
import {
  formatNoteDate,
  shortTitle,
} from "@/features/moments/components/note-paper";
import {
  SongField,
  fieldLabel,
} from "@/features/moments/components/song-field";
import { PlaceField } from "@/features/moments/components/place-field";

const patternNames: Record<NotePattern, string> = {
  plain: "Plain",
  grid: "Grid",
  lines: "Lines",
};

// A photo stays a choice after a swatch turns it off; a null `file` is the note's stored photo.
interface DraftPhoto {
  url: string;
  file: File | null;
}

type Draft = Pick<Note, "text" | "color" | "pattern" | "song" | "place"> & {
  date: string;
  photo: DraftPhoto | null;
  photoOn: boolean;
};

function draftOf(note: Note): Draft {
  return {
    text: note.text,
    color: note.color,
    pattern: note.pattern,
    song: note.song,
    place: note.place,
    date: note.date ?? "",
    photo:
      note.photoKey !== null && note.photoUrl !== null
        ? { url: note.photoUrl, file: null }
        : null,
    photoOn: note.photoKey !== null,
  };
}

const segment =
  // The 36px segment keeps a 44px hit area through its container's padding.
  "relative inline-flex h-9 flex-1 cursor-pointer items-center justify-center rounded-[10px] text-[13px] font-extrabold after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']";
const segmentOn =
  "bg-us-surface text-us-ink shadow-[0_1px_3px_rgba(31,43,66,.2)]";
const segmentOff = "text-us-muted hover:text-us-ink";

const primaryButton =
  "inline-flex h-11 cursor-pointer items-center justify-center bg-[#4F70A8] px-5 text-sm font-extrabold text-white hover:bg-[#3F5F96] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#4F70A8] disabled:cursor-not-allowed disabled:opacity-60";

function NoteEditor({
  note,
  isNew,
  notes,
  viewerId,
  playingVideoId,
  onPlay,
  onStop,
  onClose,
  onSaved,
  onDelete,
}: {
  note: Note;
  isNew: boolean;
  notes: Note[];
  viewerId: string | undefined;
  playingVideoId: string | null;
  onPlay: (videoId: string) => void;
  onStop: () => void;
  onClose: () => void;
  onSaved: (note: Note) => void;
  onDelete: (noteId: string) => Promise<void>;
}) {
  const isPhone = useMediaQuery("(max-width: 900px)");
  // Focus goes back to whatever opened the editor (a note or the pad).
  const [opener] = useState(() => document.activeElement);
  const [draft, setDraft] = useState(() => draftOf(note));
  const [saving, setSaving] = useState(false);
  const [cropFiles, setCropFiles] = useState<File[]>([]);

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const previewing =
    draft.song !== null && playingVideoId === draft.song.videoId;
  const hex = noteColorStyles[draft.color].hex;
  const showPhoto = draft.photoOn && draft.photo !== null;

  // Blob previews of picked files are freed when replaced or when the editor closes.
  const photoUrl = draft.photo?.url;
  useEffect(() => {
    if (!photoUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // Leaving the editor ends a preview.
  useEffect(() => onStop, [onStop]);

  const save = async () => {
    setSaving(true);
    try {
      const file = draft.photoOn ? (draft.photo?.file ?? null) : null;
      const content: NoteSaveRequest = {
        text: draft.text,
        color: draft.color,
        pattern: draft.pattern,
        photo: file ? "new" : draft.photoOn && draft.photo ? "keep" : "none",
        // The upload URL is signed for this exact size and type; cropping only makes JPEG, PNG or WebP
        photoFile: file
          ? { size: file.size, type: file.type as ImageUpload["type"] }
          : null,
        song: draft.song,
        place: draft.place,
        date: draft.date || null,
      };
      const { note: saved, uploadUrl } = isNew
        ? await ky
            .post("/api/moments/notes", {
              json: {
                ...content,
                x: note.x,
                y: note.y,
                rotation: note.rotation,
              } satisfies NoteCreateRequest,
              retry: 0,
            })
            .json<NoteSaveResponse>()
        : await ky
            .put(`/api/moments/notes/${note.noteId}`, {
              json: content,
              retry: 0,
            })
            .json<NoteSaveResponse>();

      if (file && uploadUrl) {
        try {
          await ky.put(uploadUrl, {
            body: file,
            headers: { "Content-Type": file.type },
            retry: 0,
          });
        } catch {
          toast.error("Failed to upload photo");
          // The saved note points at an object that never arrived, so drop the photo as profile does.
          const fallback = await ky
            .put(`/api/moments/notes/${saved.noteId}`, {
              json: { ...content, photo: "none", photoFile: null },
              retry: 0,
            })
            .json<NoteSaveResponse>()
            .catch(() => null);
          // Close even if that fails: the note exists, and a retry from a "new" editor would duplicate it.
          onSaved(fallback?.note ?? saved);
          return;
        }
      }
      onSaved(saved);
    } catch (error) {
      toast.error(await getErrorMessage(error, "Failed to save note"));
    } finally {
      setSaving(false);
    }
  };

  // With a photo picked but switched off, the segment switches it back on instead of opening the picker.
  const onUploadClick = (event: MouseEvent<HTMLLabelElement>) => {
    if (event.target instanceof HTMLInputElement) return;
    if (draft.photo && !draft.photoOn) {
      event.preventDefault();
      update({ photoOn: true });
    }
  };

  const uploadLabel = !draft.photo
    ? "Upload"
    : draft.photoOn
      ? "Change"
      : "Photo";

  const textArea = (
    <>
      <label className="sr-only" htmlFor="note-text">
        Note text
      </label>
      <textarea
        id="note-text"
        value={draft.text}
        maxLength={200}
        rows={showPhoto ? 2 : undefined}
        placeholder={showPhoto ? "Write a caption…" : "Write something…"}
        onChange={(event) => update({ text: event.target.value })}
        className={cn(
          "block w-full resize-none border-0 bg-transparent p-0 font-hand font-bold text-us-ink outline-none",
          showPhoto
            ? "text-[26px] leading-[1.1] min-[901px]:text-[34px]"
            : "mt-2.5 flex-1 text-3xl leading-[1.18] min-[901px]:mt-4.5 min-[901px]:text-[46px]",
        )}
      />
    </>
  );

  const placeBadge = draft.place ? (
    <>
      <MapPin size={isPhone ? 12 : 14} strokeWidth={2.4} aria-hidden="true" />
      <span className="truncate">{draft.place.name}</span>
    </>
  ) : null;

  const preview = (
    <div
      className={cn(
        "us-paper relative flex-none animate-pop",
        isPhone ? "size-62" : "size-110",
      )}
    >
      {draft.song ? (
        <div
          className={cn(
            "absolute top-[7%] left-[7%] z-0 size-[86%]",
            isPhone
              ? "translate-x-[24%] -translate-y-[14%]"
              : "-translate-x-[30%] -translate-y-[14%]",
          )}
        >
          <Vinyl labelColor={hex} spinning={previewing} />
        </div>
      ) : null}
      <div
        className={cn(
          "relative z-1 flex size-full flex-col overflow-hidden rounded-[4px_4px_16px_4px] shadow-[0_2px_2px_rgba(31,43,66,.08),0_40px_60px_-30px_rgba(31,43,66,.6)] max-[900px]:rounded-[4px_4px_14px_4px]",
          !showPhoto && draft.pattern === "grid" && "note-grid",
          !showPhoto && draft.pattern === "lines" && "note-lines",
        )}
        style={{ backgroundColor: hex }}
      >
        {showPhoto && draft.photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- blob or short-lived signed URL */}
            <img
              src={draft.photo.url}
              alt="Note background photo"
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-x-[8%] bottom-[7%] -rotate-[1.2deg] rounded-[4px] bg-[#FFFDF7] px-4 py-3 shadow-[0_10px_20px_-12px_rgba(31,43,66,.6)] max-[900px]:px-3 max-[900px]:py-2">
              {textArea}
            </div>
            {placeBadge ? (
              <span className="absolute top-6 left-6 inline-flex max-w-[calc(100%-48px)] items-center gap-1.25 rounded-full bg-[rgba(255,253,247,.94)] px-3 py-1.5 text-[13px] font-extrabold text-us-ink max-[900px]:top-3 max-[900px]:left-3 max-[900px]:text-xs">
                {placeBadge}
              </span>
            ) : null}
          </>
        ) : (
          <div className="relative flex flex-1 flex-col px-4.5 pt-4.5 pb-3.75 min-[901px]:px-9 min-[901px]:pt-8.5 min-[901px]:pb-7">
            <div className="flex min-h-7.5 items-center justify-between gap-2">
              <span className="font-hand text-xl leading-none font-bold text-us-muted min-[901px]:text-[30px]">
                {formatNoteDate(draft.date || null)}
              </span>
              {draft.song ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1.25 text-xs font-extrabold whitespace-nowrap text-us-ink shadow-[inset_0_0_0_1px_var(--us-hair)] min-[901px]:px-3 min-[901px]:py-1.5 min-[901px]:text-[13px]">
                  <Music
                    size={isPhone ? 12 : 14}
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                  {shortTitle(draft.song.title)}
                </span>
              ) : null}
            </div>
            {textArea}
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-us-muted min-[901px]:gap-2 min-[901px]:text-[13px]">
              <AuthorBadge
                author={note.author}
                viewerId={viewerId}
                className="size-5.5 text-[10px] min-[901px]:size-6.5 min-[901px]:text-xs"
              />
              <span className="truncate">{note.author.name}</span>
              {placeBadge ? (
                <span className="ml-auto inline-flex min-w-0 items-center gap-1 text-us-ink">
                  {placeBadge}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
      {previewing && draft.song ? (
        <span className="sr-only" role="status">
          Playing {draft.song.title}
        </span>
      ) : null}
    </div>
  );

  const deleteButton = (label: string, className: string) => (
    <AlertDialogButton
      buttonVariant="ghost"
      buttonClassName={className}
      alertTitle="Delete this note?"
      alertDescription="This can't be undone."
      confirmButtonText="Delete"
      onConfirm={() => onDelete(note.noteId)}
    >
      <Trash2 aria-hidden="true" />
      {label}
    </AlertDialogButton>
  );

  const fields: ReactNode = (
    <>
      <div className="flex flex-col gap-2.5">
        <span className={fieldLabel}>Background</span>
        <div className="flex flex-wrap items-center gap-2.5 max-[900px]:flex-nowrap max-[900px]:justify-between">
          {noteColors.map((color: NoteColor) => {
            const pressed = !draft.photoOn && draft.color === color;
            return (
              <button
                key={color}
                type="button"
                aria-label={noteColorStyles[color].name}
                aria-pressed={pressed}
                onClick={() => update({ color, photoOn: false })}
                className="size-11 flex-none cursor-pointer rounded-full p-1 focus-visible:outline-3 focus-visible:outline-[#4F70A8] min-[901px]:size-9 min-[901px]:p-0"
              >
                <span
                  aria-hidden="true"
                  className="block size-full rounded-full"
                  style={{
                    background: noteColorStyles[color].hex,
                    boxShadow: pressed
                      ? "0 0 0 3px var(--us-panel), 0 0 0 5px #4F70A8"
                      : "inset 0 0 0 1px rgba(31,43,66,.18)",
                  }}
                />
              </button>
            );
          })}
        </div>
        <div
          role="group"
          aria-label="Paper"
          className="flex gap-1 rounded-[14px] bg-us-subtle p-1"
        >
          {notePatterns.map((pattern) => {
            const pressed = !draft.photoOn && draft.pattern === pattern;
            return (
              <button
                key={pattern}
                type="button"
                aria-pressed={pressed}
                onClick={() => update({ pattern, photoOn: false })}
                className={cn(
                  segment,
                  "focus-visible:outline-3 focus-visible:outline-[#4F70A8]",
                  pressed ? segmentOn : segmentOff,
                )}
              >
                {patternNames[pattern]}
              </button>
            );
          })}
          <label
            onClick={onUploadClick}
            className={cn(
              segment,
              "flex-[1.3] gap-1.5 focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-[#4F70A8]",
              draft.photoOn ? segmentOn : segmentOff,
            )}
          >
            {draft.photo ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob or short-lived signed URL
              <img
                src={draft.photo.url}
                alt=""
                className="pointer-events-none size-5 rounded-[4px] object-cover"
              />
            ) : (
              <ImageIcon size={15} strokeWidth={2.2} aria-hidden="true" />
            )}
            <span>{uploadLabel}</span>
            <input
              type="file"
              accept="image/*,.heic,.heif"
              aria-label="Upload a background image"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file && (file.type.startsWith("image/") || isHeic(file)))
                  setCropFiles([file]);
              }}
            />
          </label>
        </div>
      </div>

      <SongField
        song={draft.song}
        labelColor={hex}
        notes={notes}
        previewing={previewing}
        onChange={(song) => {
          if (previewing) onStop();
          update({ song });
        }}
        onTogglePreview={() => {
          if (!draft.song) return;
          if (previewing) onStop();
          else onPlay(draft.song.videoId);
        }}
      />

      <PlaceField
        place={draft.place}
        notes={notes}
        onChange={(place) => update({ place })}
      />

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="note-date" className={fieldLabel}>
          Date
        </label>
        <input
          id="note-date"
          type="date"
          value={draft.date}
          onChange={(event) => update({ date: event.target.value })}
          className="h-11 rounded-xl border-0 bg-us-surface px-3 text-base font-bold text-us-ink shadow-[inset_0_0_0_1px_var(--us-field-line)] outline-none focus-visible:shadow-[inset_0_0_0_2px_#4F70A8] min-[901px]:text-sm"
        />
      </div>
    </>
  );

  const title = (
    <DialogPrimitive.Title
      className={cn(
        "font-black text-us-ink",
        isPhone ? "text-base" : "text-[22px] leading-[1.2]",
      )}
    >
      {isNew ? "New note" : "Edit note"}
    </DialogPrimitive.Title>
  );

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Content
        aria-label="Edit note"
        aria-modal="true"
        aria-labelledby={undefined}
        aria-describedby={undefined}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener instanceof HTMLElement) opener.focus();
        }}
        className={cn(
          "z-3000 animate-fade overflow-y-auto overscroll-contain",
          isPhone
            ? "fixed inset-0 flex flex-col bg-us-wall pb-[env(safe-area-inset-bottom)]"
            : "absolute inset-0 flex flex-wrap items-center justify-center gap-16 bg-us-scrim px-10 py-8 backdrop-blur-[8px]",
        )}
      >
        {isPhone ? (
          <>
            <div className="flex h-87 flex-none flex-col bg-[radial-gradient(var(--us-dot)_1.2px,transparent_1.7px)] bg-size-[22px_22px] pt-[env(safe-area-inset-top)]">
              <div className="flex h-15 flex-none items-center justify-between gap-2 px-3">
                <DialogPrimitive.Close className="h-11 cursor-pointer rounded-xl px-3 text-[15px] font-extrabold text-us-ink hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]">
                  Cancel
                </DialogPrimitive.Close>
                {title}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className={cn(
                    primaryButton,
                    "rounded-full px-4.5 text-[15px]",
                  )}
                >
                  Stick it
                </button>
              </div>
              <div className="flex flex-1 items-center justify-center">
                {preview}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 rounded-t-[28px] bg-us-panel px-4 pt-5 pb-3 shadow-[0_-18px_40px_-28px_rgba(31,43,66,.45)]">
              {fields}
              {isNew
                ? null
                : deleteButton(
                    "Delete note",
                    "mt-auto h-11 cursor-pointer rounded-xl text-sm font-extrabold text-us-danger hover:bg-us-hover hover:text-us-danger",
                  )}
            </div>
          </>
        ) : (
          <>
            <DialogPrimitive.Close
              aria-label="Close editor"
              className="absolute top-6 right-6 flex size-11 cursor-pointer items-center justify-center rounded-full bg-us-surface text-us-ink shadow-[0_6px_16px_-10px_rgba(31,43,66,.5)] hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]"
            >
              <X size={18} strokeWidth={2.4} aria-hidden="true" />
            </DialogPrimitive.Close>
            {preview}
            <div className="flex w-95 animate-rise flex-col gap-4.5 rounded-[28px] border border-us-line bg-us-panel p-6 shadow-[0_34px_60px_-34px_rgba(31,43,66,.5)]">
              {title}
              {fields}
              <div className="flex items-center gap-2 pt-0.5">
                {isNew
                  ? null
                  : deleteButton(
                      "Delete",
                      "h-11 cursor-pointer rounded-xl px-3 text-sm font-extrabold text-us-danger hover:bg-us-hover hover:text-us-danger",
                    )}
                <span className="flex-1" />
                <DialogPrimitive.Close className="h-11 cursor-pointer rounded-xl bg-us-subtle px-4 text-sm font-extrabold text-us-ink hover:bg-us-hover focus-visible:outline-3 focus-visible:outline-[#4F70A8]">
                  Cancel
                </DialogPrimitive.Close>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save()}
                  className={cn(primaryButton, "rounded-xl")}
                >
                  Stick it
                </button>
              </div>
            </div>
          </>
        )}

        <ImageCropDialog
          files={cropFiles}
          aspect={1}
          onComplete={([cropped]) => {
            setCropFiles([]);
            if (!cropped) return;
            update({
              photo: {
                url: URL.createObjectURL(cropped),
                file: cropped,
              },
              photoOn: true,
            });
          }}
        />
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  );
}

export { NoteEditor };
