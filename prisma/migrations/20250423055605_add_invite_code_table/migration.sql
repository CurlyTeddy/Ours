-- CreateTable
CREATE TABLE "invite_code" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expire_at" DATETIME NOT NULL,
    "used_at" DATETIME,
    "used_by" TEXT

    CONSTRAINT "both_or_neither_null" CHECK (
        ("used_at" IS NULL AND "used_by" IS NULL)
        OR
        ("used_at" IS NOT NULL AND "used_by" IS NOT NULL)
    )
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    CONSTRAINT "user_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "invite_code" ("used_by") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_user" ("email", "name", "password", "user_id") SELECT "email", "name", "password", "user_id" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "invite_code_used_by_key" ON "invite_code"("used_by");
