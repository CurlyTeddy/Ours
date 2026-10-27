import type { Trip } from "@prisma/client";
import type { TripDto } from "@/features/two-dos/models/trip";

function toTripDto(trip: Trip): TripDto {
  return {
    id: trip.tripId,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    position: trip.position,
  };
}

export { toTripDto };
