import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { parseBody } from "@/lib/parse-body";
import {
  tripSaveSchema,
  type TripResponse,
  type TripsResponse,
} from "@/features/two-dos/models/trip";
import { toTripDto } from "@/features/two-dos/trip-dto";

async function GET(): Promise<NextResponse<TripsResponse | HttpErrorPayload>> {
  try {
    const trips = await prisma.trip.findMany({ orderBy: { position: "asc" } });
    return NextResponse.json({ trips: trips.map(toTripDto) }, { status: 200 });
  } catch (error) {
    console.error("Error fetching trips:", error);
    return NextResponse.json(
      { message: "Failed to fetch trips. Please try again later." },
      { status: 500 },
    );
  }
}

async function POST(
  request: NextRequest,
): Promise<NextResponse<TripResponse | HttpErrorPayload>> {
  const parsed = await parseBody(request, tripSaveSchema);
  if ("error" in parsed) return parsed.error;

  try {
    const trip = await prisma.$transaction(async (txn) => {
      const last = await txn.trip.aggregate({ _max: { position: true } });
      return txn.trip.create({
        data: { ...parsed.data, position: (last._max.position ?? 0) + 1 },
      });
    });
    return NextResponse.json({ trip: toTripDto(trip) }, { status: 201 });
  } catch (error) {
    console.error("Error creating trip:", error);
    return NextResponse.json(
      { message: "Failed to create a trip. Please try again later." },
      { status: 500 },
    );
  }
}

export { GET, POST };
