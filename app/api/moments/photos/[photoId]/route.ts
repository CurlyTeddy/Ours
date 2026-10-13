import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { deleteObjects } from "@/lib/s3-client";
import { HttpErrorPayload } from "@/lib/error";
import { Prisma } from "@prisma/client";

interface DeleteResponse {
  success: boolean;
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
): Promise<NextResponse<DeleteResponse | HttpErrorPayload>> {
  try {
    const { photoId } = await params;

    const photo = await prisma.momentPhoto.delete({
      where: { photoId },
    });

    await deleteObjects([`carousel/${photo.imageKey}`]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete photo:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { message: "Photo not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Failed to delete photo" },
      { status: 500 },
    );
  }
}

export { DELETE };
