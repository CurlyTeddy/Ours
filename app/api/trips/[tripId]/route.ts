import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database-client";
import { HttpErrorPayload } from "@/lib/error";
import { parseBody } from "@/lib/parse-body";
import {
  datesInOrder,
  datesOrderMessage,
  tripPatchSchema,
  type TripResponse,
} from "@/features/two-dos/models/trip";
import { toTripDto } from "@/features/two-dos/trip-dto";
import { isPrismaError, spotTakenMessage } from "@/features/two-dos/queries";

async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
): Promise<NextResponse<TripResponse | HttpErrorPayload>> {
  const { tripId } = await params;
  const parsed = await parseBody(request, tripPatchSchema);
  if ("error" in parsed) return parsed.error;
  const patch = parsed.data;
  if (Object.values(patch).every((value) => value === undefined)) {
    return NextResponse.json({ message: "Nothing to change" }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (txn) => {
      const current = await txn.trip.findUnique({ where: { tripId } });
      if (current === null) return "missing" as const;
      // The pair is checked on the merged trip, since a patch may send only one end
      if (!datesInOrder({ ...current, ...patch })) return "dates" as const;
      return txn.trip.update({ where: { tripId }, data: patch });
    });

    if (result === "missing") {
      return NextResponse.json({ message: "Trip not found." }, { status: 404 });
    }
    if (result === "dates") {
      return NextResponse.json({ message: datesOrderMessage }, { status: 400 });
    }
    return NextResponse.json({ trip: toTripDto(result) }, { status: 200 });
  } catch (error) {
    console.error("Error updating trip:", error);
    if (isPrismaError(error, "P2002")) {
      return NextResponse.json({ message: spotTakenMessage }, { status: 409 });
    }
    return NextResponse.json(
      { message: "Failed to update the trip. Please try again later." },
      { status: 500 },
    );
  }
}

async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> },
): Promise<NextResponse<null | HttpErrorPayload>> {
  const { tripId } = await params;

  try {
    await prisma.$transaction(async (txn) => {
      // Same as the FK's SET NULL, but does not depend on the connection enforcing foreign keys
      await txn.todo.updateMany({ where: { tripId }, data: { tripId: null } });
      await txn.trip.delete({ where: { tripId } });
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (isPrismaError(error, "P2025")) {
      return NextResponse.json({ message: "Trip not found." }, { status: 404 });
    }
    console.error("Error deleting trip:", error);
    return NextResponse.json(
      { message: "Failed to delete the trip. Please try again later." },
      { status: 500 },
    );
  }
}

export { DELETE, PATCH };
