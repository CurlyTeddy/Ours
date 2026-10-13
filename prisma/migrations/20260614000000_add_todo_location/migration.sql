-- CreateTable
CREATE TABLE "location" (
    "location_id" TEXT NOT NULL PRIMARY KEY,
    "place_id" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" REAL NOT NULL,
    "longitude" REAL NOT NULL
);

-- Default location for todos without a picked place; existing todos point here.
INSERT INTO "location" ("location_id", "place_id", "name", "address", "latitude", "longitude") VALUES ('default', NULL, 'Taiwan', 'Taiwan', 23.6978, 120.9605);

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
    "location_id" TEXT NOT NULL,
    "priority" REAL NOT NULL,
    "image_keys" TEXT,
    CONSTRAINT "todo_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "todo_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location" ("location_id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_todo" ("created_at", "created_by", "description", "done_at", "image_keys", "location_id", "priority", "title", "todo_id", "updated_at") SELECT "created_at", "created_by", "description", "done_at", "image_keys", 'default', "priority", "title", "todo_id", "updated_at" FROM "todo";
DROP TABLE "todo";
ALTER TABLE "new_todo" RENAME TO "todo";
CREATE UNIQUE INDEX "todo_priority_key" ON "todo"("priority");
CREATE INDEX "todo_priority_idx" ON "todo"("priority");
CREATE INDEX "todo_location_id_idx" ON "todo"("location_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "location_place_id_key" ON "location"("place_id");
