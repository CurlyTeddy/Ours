-- CreateTable
CREATE TABLE "todo" (
    "todo_id" TEXT NOT NULL PRIMARY KEY,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL,
    "done_at" DATETIME,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" REAL NOT NULL,
    CONSTRAINT "todo_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "todo_priority_key" ON "todo"("priority");

-- CreateIndex
CREATE INDEX "todo_priority_idx" ON "todo"("priority");
