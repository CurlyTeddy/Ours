import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/database-client";
import s3Client from "@/lib/s3-client";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { HttpErrorPayload } from "@/lib/error";
import { env } from "@/lib/env";
import { Prisma } from "@/lib/generated/prisma";

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

    // Assume S3 operations won't fail so no need to wrap it in a transaction
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: `images-${env.NEXT_PUBLIC_ENVIRONMENT}`,
        Key: `carousel/${photo.imageKey}`,
      }),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
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
