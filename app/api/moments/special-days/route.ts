import { NextRequest, NextResponse } from "next/server";
import type { SpecialDay as SpecialDayRow } from "@prisma/client";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { specialDayCreateSchema } from "@/features/moments/models/requests";
import {
  SpecialDay,
  SpecialDayResponse,
} from "@/features/moments/models/responses";

function toSpecialDay(specialDay: SpecialDayRow): SpecialDay {
  return { ...specialDay, createdAt: specialDay.createdAt.toISOString() };
}

async function GET(): Promise<
  NextResponse<SpecialDayResponse | HttpErrorPayload>
> {
  try {
    const specialDays = await prisma.specialDay.findMany({
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ specialDays: specialDays.map(toSpecialDay) });
  } catch (error) {
    console.error("Failed to fetch special days:", error);
    return NextResponse.json(
      { message: "Failed to fetch special days" },
      { status: 500 },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<SpecialDay | HttpErrorPayload>> {
  // A malformed body parses to null, which the schema rejects like any bad input.
  const body: unknown = await request.json().catch(() => null);
  const validatedFields = specialDayCreateSchema.safeParse(body);

  if (!validatedFields.success) {
    return NextResponse.json(
      { message: "Invalid special day" },
      { status: 400 },
    );
  }

  try {
    const specialDay = await prisma.specialDay.create({
      data: validatedFields.data,
    });

    return NextResponse.json(toSpecialDay(specialDay));
  } catch (error) {
    console.error("Failed to create special day:", error);
    return NextResponse.json(
      { message: "Failed to create special day" },
      { status: 500 },
    );
  }
}

export { GET, POST };
