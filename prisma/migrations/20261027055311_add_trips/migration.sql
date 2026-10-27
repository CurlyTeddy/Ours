-- CreateTable
CREATE TABLE "trip" (
    "trip_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "start_date" TEXT,
    "end_date" TEXT,
    "position" REAL NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_todo" (
    "todo_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "done_at" DATETIME,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location_id" TEXT,
    "priority" REAL NOT NULL,
    "image_keys" TEXT,
    "trip_id" TEXT,
    CONSTRAINT "todo_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "todo_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location" ("location_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "todo_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "trip" ("trip_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_todo" ("created_at", "created_by", "description", "done_at", "image_keys", "location_id", "priority", "title", "todo_id", "updated_at") SELECT "created_at", "created_by", "description", "done_at", "image_keys", "location_id", "priority", "title", "todo_id", "updated_at" FROM "todo";
DROP TABLE "todo";
ALTER TABLE "new_todo" RENAME TO "todo";
CREATE UNIQUE INDEX "todo_priority_key" ON "todo"("priority");
CREATE INDEX "todo_priority_idx" ON "todo"("priority");
CREATE INDEX "todo_location_id_idx" ON "todo"("location_id");
CREATE INDEX "todo_trip_id_idx" ON "todo"("trip_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "trip_position_key" ON "trip"("position");

-- Data step: the placeholder "default" location becomes "no location"
UPDATE "todo" SET "location_id" = NULL WHERE "location_id" = 'default';
DELETE FROM "location"
WHERE "location_id" = 'default'
  AND NOT EXISTS (SELECT 1 FROM "todo" WHERE "location_id" = 'default')
  AND NOT EXISTS (SELECT 1 FROM "moment_note" WHERE "location_id" = 'default');
