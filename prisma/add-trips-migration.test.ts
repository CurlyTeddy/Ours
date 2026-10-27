import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";

const dir = path.join(process.cwd(), "prisma", "migrations");
const migrations = readdirSync(dir)
  .filter((name) => /^\d+_/.test(name))
  .sort();
const addTrips = migrations.find((name) => name.endsWith("_add_trips"));
const sql = (name: string) =>
  readFileSync(path.join(dir, name, "migration.sql"), "utf8");

// Applies every migration before add_trips, seeds, then runs add_trips.
const migrate = async (seed: (db: Client) => Promise<void>) => {
  const db = createClient({ url: ":memory:" });
  for (const name of migrations) {
    if (name === addTrips) break;
    await db.executeMultiple(sql(name));
  }
  await seed(db);
  await db.executeMultiple(sql(addTrips as string));
  return db;
};
const now = "2026-01-01T00:00:00.000Z";
const seedBase = async (db: Client) => {
  // The user row needs an invite code; seeding is not under test
  await db.execute("PRAGMA foreign_keys=OFF");
  await db.execute(
    `INSERT INTO "user" ("user_id", "email", "name", "password") VALUES ('u1', 't@example.com', 'Teddy', 'x')`,
  );
  await db.execute(
    `INSERT INTO "location" ("location_id", "place_id", "name", "address", "latitude", "longitude") VALUES ('kyoto', 'place-kyoto', 'Kyoto', 'Kyoto, Japan', 35.01, 135.77)`,
  );
  const todo = (id: string, location: string, doneAt: string | null, priority: number) =>
    db.execute({
      sql: `INSERT INTO "todo" ("todo_id", "created_at", "created_by", "updated_at", "done_at", "title", "location_id", "priority") VALUES (?, ?, 'u1', ?, ?, ?, ?, ?)`,
      args: [id, now, now, doneAt, id, location, priority],
    });
  await todo("undone-default", "default", null, 1);
  await todo("done-default", "default", "2025-06-01T00:00:00.000Z", 2.5);
  await todo("undone-kyoto", "kyoto", null, 4);
};
const todos = async (db: Client) =>
  (
    await db.execute(
      `SELECT "todo_id", "location_id", "trip_id", "priority", "done_at" FROM "todo" ORDER BY "priority"`,
    )
  ).rows.map((row) => ({ ...row }));
const locationIds = async (db: Client) =>
  (await db.execute(`SELECT "location_id" FROM "location" ORDER BY 1`)).rows.map(
    (row) => row.location_id,
  );

describe("R2/R3: add_trips migration", () => {
  test("exists", () => {
    expect(addTrips).toBeDefined();
  });

  test("to-dos keep priority and done state, get no trip; default becomes no location", async () => {
    const db = await migrate(seedBase);

    expect(await todos(db)).toEqual([
      {
        todo_id: "undone-default",
        location_id: null,
        trip_id: null,
        priority: 1,
        done_at: null,
      },
      {
        todo_id: "done-default",
        location_id: null,
        trip_id: null,
        priority: 2.5,
        done_at: "2025-06-01T00:00:00.000Z",
      },
      {
        todo_id: "undone-kyoto",
        location_id: "kyoto",
        trip_id: null,
        priority: 4,
        done_at: null,
      },
    ]);
    expect(await locationIds(db)).toEqual(["kyoto"]);
  });

  test("the default row stays while a moment note uses it", async () => {
    const db = await migrate(async (db) => {
      await seedBase(db);
      await db.execute(
        `INSERT INTO "moment_note" ("note_id", "created_at", "updated_at", "author_id", "text", "color", "pattern", "location_id", "x", "y", "rotation", "z") VALUES ('n1', '${now}', '${now}', 'u1', 'hi', 'mist', 'plain', 'default', 0, 0, 0, 0)`,
      );
    });

    expect(await locationIds(db)).toEqual(["default", "kyoto"]);
    expect((await todos(db)).map((t) => t.location_id)).toEqual([
      null,
      null,
      "kyoto",
    ]);
  });

  test("an empty database migrates and drops the default row", async () => {
    const db = await migrate(async () => undefined);

    expect(await locationIds(db)).toEqual([]);
    expect((await db.execute(`SELECT COUNT(*) AS n FROM "trip"`)).rows[0].n).toBe(0);
  });

  test("the trip table and the nullable FKs exist", async () => {
    const db = await migrate(seedBase);

    const columns = (await db.execute(`PRAGMA table_info("trip")`)).rows.map(
      (row) => row.name,
    );
    expect(columns).toEqual(
      expect.arrayContaining([
        "trip_id",
        "created_at",
        "name",
        "start_date",
        "end_date",
        "position",
      ]),
    );
    await db.execute(
      `INSERT INTO "trip" ("trip_id", "name", "position") VALUES ('t1', 'Japan', 1)`,
    );
    await db.execute(`UPDATE "todo" SET "trip_id" = 't1' WHERE "todo_id" = 'undone-kyoto'`);
    await db.execute("PRAGMA foreign_keys=ON");
    await db.execute(`DELETE FROM "trip" WHERE "trip_id" = 't1'`);
    // ON DELETE SET NULL
    expect(
      (await todos(db)).find((t) => t.todo_id === "undone-kyoto")?.trip_id,
    ).toBeNull();
    await db.execute(`DELETE FROM "location" WHERE "location_id" = 'kyoto'`);
    expect(
      (await todos(db)).find((t) => t.todo_id === "undone-kyoto")?.location_id,
    ).toBeNull();
  });
});
