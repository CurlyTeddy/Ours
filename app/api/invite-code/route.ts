import { prisma } from "@/lib/database-client";
import { NextResponse } from "next/server";

async function POST() {
  try {
    const inviteCode = await prisma.inviteCode.create({
      data: {
        expireAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });

    return NextResponse.json(
      {
        inviteCode,
      },
      {
        status: 200,
      },
    );
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      {
        message: "Unexpected database error.",
      },
      {
        status: 500,
      },
    );
  }
}

export { POST };
