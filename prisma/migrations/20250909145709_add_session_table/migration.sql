-- CreateTable
CREATE TABLE "session" (
    "session_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "expire_at" DATETIME NOT NULL,
    CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);
