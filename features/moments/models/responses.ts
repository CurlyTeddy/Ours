import type {
  NoteColor,
  NotePattern,
  NotePlace,
  NoteSong,
} from "@/features/moments/models/requests";

interface Note {
  noteId: string;
  text: string;
  color: NoteColor;
  pattern: NotePattern;
  photoKey: string | null;
  photoUrl: string | null;
  song: NoteSong | null;
  place: NotePlace | null;
  date: string | null;
  x: number;
  y: number;
  rotation: number;
  z: number;
  author: { id: string; name: string; imageUrl: string | null };
  createdAt: string;
}

interface NoteListResponse {
  notes: Note[];
}

// uploadUrl is set only when the request asked for a new photo.
interface NoteSaveResponse {
  note: Note;
  uploadUrl: string | null;
}

interface SpecialDay {
  specialDayId: string;
  name: string;
  month: number;
  day: number;
  year: number | null;
  createdAt: string;
}

interface SpecialDayResponse {
  specialDays: SpecialDay[];
}

export type {
  Note,
  NoteSong,
  NotePlace,
  NoteListResponse,
  NoteSaveResponse,
  SpecialDay,
  SpecialDayResponse,
};
