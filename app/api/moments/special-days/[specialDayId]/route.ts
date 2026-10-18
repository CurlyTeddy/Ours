import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { Prisma } from "@prisma/client";

interface DeleteResponse {
  success: boolean;
}

async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ specialDayId: string }> },
): Promise<NextResponse<DeleteResponse | HttpErrorPayload>> {
  try {
    const { specialDayId } = await params;

    await prisma.specialDay.delete({
      where: { specialDayId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete special day:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { message: "Special day not found." },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { message: "Failed to delete special day" },
      { status: 500 },
    );
  }
}

export { DELETE };
