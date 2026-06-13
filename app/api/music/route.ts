import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { validateSessionToken } from "@/features/auth/session";
import { musicSelectionRequestSchema } from "@/features/music/models/requests";
import {
  MusicResponse,
  MusicSelectionResponse,
} from "@/features/music/models/responses";

async function getUserId(): Promise<string | null> {
  const cookiesStore = await cookies();
  const { user } = await validateSessionToken(
    cookiesStore.get("session")?.value,
  );
  return user?.id ?? null;
}

async function GET(): Promise<NextResponse<MusicResponse | HttpErrorPayload>> {
  const userId = await getUserId();
  if (userId === null) {
    return NextResponse.json(
      { message: "Invalid or expired session." },
      { status: 401 },
    );
  }

  try {
    const sharedMusic = await prisma.sharedMusic.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        selectedBy: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      shared: sharedMusic.map((music) => ({
        selectedById: music.selectedById,
        videoId: music.videoId,
        title: music.title,
        channelTitle: music.channelTitle,
        thumbnailUrl: music.thumbnailUrl,
        selectedBy: music.selectedBy.name,
        updatedAt: music.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Error fetching shared music:", error);
    return NextResponse.json(
      { message: "Failed to fetch shared music." },
      { status: 500 },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<MusicSelectionResponse | HttpErrorPayload>> {
  const parsedRequest = musicSelectionRequestSchema.safeParse(
    await request.json(),
  );

  if (!parsedRequest.success) {
    return NextResponse.json(
      { message: "Invalid music selection." },
      { status: 400 },
    );
  }

  const userId = await getUserId();
  if (userId === null) {
    return NextResponse.json(
      { message: "Invalid or expired session." },
      { status: 401 },
    );
  }

  try {
    const music = await prisma.sharedMusic.upsert({
      where: { selectedById: userId },
      create: {
        ...parsedRequest.data,
        selectedById: userId,
      },
      update: parsedRequest.data,
      include: {
        selectedBy: {
          select: { name: true },
        },
      },
    });

    return NextResponse.json({
      music: {
        selectedById: music.selectedById,
        videoId: music.videoId,
        title: music.title,
        channelTitle: music.channelTitle,
        thumbnailUrl: music.thumbnailUrl,
        selectedBy: music.selectedBy.name,
        updatedAt: music.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Error selecting shared music:", error);
    return NextResponse.json(
      { message: "Failed to save shared music." },
      { status: 500 },
    );
  }
}

export { GET, POST };
