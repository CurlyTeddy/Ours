/*
  Warnings:

  - You are about to drop the column `place_id` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `place_latitude` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `place_longitude` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `place_name` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `song_channel_title` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `song_thumbnail_url` on the `moment_note` table. All the data in the column will be lost.
  - You are about to drop the column `song_title` on the `moment_note` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "song" (
    "video_id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "channel_title" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_moment_note" (
    "note_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "author_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "photo_key" TEXT,
    "song_video_id" TEXT,
    "location_id" TEXT,
    "date" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "rotation" REAL NOT NULL,
    "z" INTEGER NOT NULL,
    CONSTRAINT "moment_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "moment_note_song_video_id_fkey" FOREIGN KEY ("song_video_id") REFERENCES "song" ("video_id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "moment_note_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location" ("location_id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_moment_note" ("author_id", "color", "created_at", "date", "note_id", "pattern", "photo_key", "rotation", "song_video_id", "text", "updated_at", "x", "y", "z") SELECT "author_id", "color", "created_at", "date", "note_id", "pattern", "photo_key", "rotation", "song_video_id", "text", "updated_at", "x", "y", "z" FROM "moment_note";
DROP TABLE "moment_note";
ALTER TABLE "new_moment_note" RENAME TO "moment_note";
CREATE UNIQUE INDEX "moment_note_photo_key_key" ON "moment_note"("photo_key");
CREATE INDEX "moment_note_song_video_id_idx" ON "moment_note"("song_video_id");
CREATE INDEX "moment_note_location_id_idx" ON "moment_note"("location_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
