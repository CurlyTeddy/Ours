import { Prisma } from "@prisma/client";

// Database helpers shared by the to-do and trip route handlers.

const spotTakenMessage = "That spot was just taken. Refresh and try again.";

const isPrismaError = (error: unknown, code: string) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;

const tripMissing = async (txn: Prisma.TransactionClient, tripId: string) =>
  (await txn.trip.findUnique({ where: { tripId } })) === null;

// Priorities are unique across every list, so the end of any list is the global max + 1.
const nextPriority = async (txn: Prisma.TransactionClient) =>
  ((await txn.todo.aggregate({ _max: { priority: true } }))._max.priority ??
    0) + 1;

// Notes share the location table, so a row goes only when no to-do and no note uses it.
async function deleteOrphanLocation(
  txn: Prisma.TransactionClient,
  locationId: string | null,
) {
  if (locationId === null) return;
  await txn.location.deleteMany({
    where: { locationId, todos: { none: {} }, momentNotes: { none: {} } },
  });
}

export {
  deleteOrphanLocation,
  isPrismaError,
  nextPriority,
  spotTakenMessage,
  tripMissing,
};
