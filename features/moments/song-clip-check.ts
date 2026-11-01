import { NextResponse } from "next/server";
import type { HttpErrorPayload } from "@/lib/error";
import { fetchVideoDurationSeconds } from "@/features/music/video-duration";
import type { NoteSaveRequest } from "@/features/moments/models/requests";

// The clip is checked against YouTube's own length, never one the client sends.
// Returns the error response to send, or null when the clip fits (or there is none).
async function songClipError({
  song,
  songClip,
}: NoteSaveRequest): Promise<NextResponse<HttpErrorPayload> | null> {
  if (songClip === null || song === null) {
    return null;
  }

  let durationSeconds: number | null;
  try {
    durationSeconds = await fetchVideoDurationSeconds(song.videoId);
  } catch (error) {
    console.error("Failed to check the song length:", error);
    return NextResponse.json(
      { message: "Couldn't check the song length. Try again." },
      { status: 502 },
    );
  }

  if (durationSeconds === null) {
    return NextResponse.json(
      { message: "That song is no longer on YouTube." },
      { status: 400 },
    );
  }
  if (songClip.endSeconds > durationSeconds) {
    return NextResponse.json(
      { message: "The clip runs past the end of the song." },
      { status: 400 },
    );
  }
  return null;
}

export { songClipError };
