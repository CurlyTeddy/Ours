-- CreateTable
CREATE TABLE "shared_music" (
    "selected_by" TEXT NOT NULL PRIMARY KEY,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "channel_title" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "shared_music_selected_by_fkey" FOREIGN KEY ("selected_by") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
