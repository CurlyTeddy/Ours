import { describe, expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";

const dir = path.join(process.cwd(), "prisma", "migrations");
const migrations = readdirSync(dir)
  .filter((name) => /^\d+_/.test(name))
  .sort();
const addSongClip = migrations.find((name) => name.endsWith("_add_song_clip"));
const sql = (name: string) =>
  readFileSync(path.join(dir, name, "migration.sql"), "utf8");

describe("R1: add_song_clip migration", () => {
  test("exists once and only adds the two columns to moment_note", () => {
    expect(migrations.filter((name) => name.endsWith("_add_song_clip"))).toHaveLength(1);
    const statements = sql(addSongClip as string)
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("--"));

    expect(statements.sort()).toEqual([
      'ALTER TABLE "moment_note" ADD COLUMN "song_end_seconds" INTEGER;',
      'ALTER TABLE "moment_note" ADD COLUMN "song_start_seconds" INTEGER;',
    ]);
  });

  test("after every migration both columns are nullable integers on moment_note, not song", async () => {
    const db = createClient({ url: ":memory:" });
    for (const name of migrations) await db.executeMultiple(sql(name));

    const columns = async (table: string) =>
      (await db.execute(`PRAGMA table_info("${table}")`)).rows.map((row) => ({
        name: String(row.name),
        type: String(row.type),
        notnull: Number(row.notnull),
        dflt: row.dflt_value,
      }));
    const note = await columns("moment_note");
    for (const name of ["song_start_seconds", "song_end_seconds"]) {
      expect(note.find((column) => column.name === name)).toEqual({
        name,
        type: "INTEGER",
        notnull: 0,
        dflt: null,
      });
    }
    const song = (await columns("song")).map((column) => column.name);
    expect(song).not.toContain("song_start_seconds");
    expect(song).not.toContain("song_end_seconds");
  });
});
