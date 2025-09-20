-- CreateTable
CREATE TABLE "moment_photo" (
    "photo_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image_key" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "bulletin_message" (
    "message_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "bulletin_message_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
