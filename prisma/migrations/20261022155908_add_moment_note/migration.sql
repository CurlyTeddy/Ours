-- AlterTable
ALTER TABLE "special_day" ADD COLUMN "year" INTEGER;

-- CreateTable
CREATE TABLE "moment_note" (
    "note_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "author_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "photo_key" TEXT,
    "song_video_id" TEXT,
    "song_title" TEXT,
    "song_channel_title" TEXT,
    "song_thumbnail_url" TEXT,
    "place_name" TEXT,
    "place_id" TEXT,
    "place_latitude" REAL,
    "place_longitude" REAL,
    "date" TEXT,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "rotation" REAL NOT NULL,
    "z" INTEGER NOT NULL,
    CONSTRAINT "moment_note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "moment_note_photo_key_key" ON "moment_note"("photo_key");
