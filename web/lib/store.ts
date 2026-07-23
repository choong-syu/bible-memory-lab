import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import postgres from "postgres";
import type { Activity, Database } from "./types";

const emptyDb = (): Database => ({
  users: [], activities: [], drafts: [], selectionHistories: [], quizzes: [], attempts: [], wrongNotes: [], nounOverrides: [],
});

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "app-db.json");
let queue = Promise.resolve();
let sqlClient: ReturnType<typeof postgres> | null = null;

function sql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sqlClient) sqlClient = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
  return sqlClient;
}

async function load(): Promise<Database> {
  await mkdir(dataDir, { recursive: true });
  try { return JSON.parse(await readFile(dbPath, "utf8")); }
  catch { const db = emptyDb(); await save(db); return db; }
}

async function save(db: Database) {
  const temp = `${dbPath}.tmp`;
  await writeFile(temp, JSON.stringify(db, null, 2), "utf8");
  await rename(temp, dbPath);
}

async function ensurePg() {
  const client = sql();
  if (!client) return null;
  await client`CREATE TABLE IF NOT EXISTS bible_app_state (
    id INTEGER PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
  await client`INSERT INTO bible_app_state (id, data) VALUES (1, ${client.json(emptyDb())}) ON CONFLICT (id) DO NOTHING`;
  return client;
}

export async function readDb() {
  const client = await ensurePg();
  if (!client) return load();
  const rows = await client<{ data: Database }[]>`SELECT data FROM bible_app_state WHERE id = 1`;
  return rows[0]?.data || emptyDb();
}

export function mutateDb<T>(fn: (db: Database) => T | Promise<T>): Promise<T> {
  if (process.env.DATABASE_URL) {
    return (async () => {
      const client = await ensurePg();
      if (!client) throw new Error("데이터베이스 연결에 실패했습니다.");
      return client.begin(async (transaction) => {
        await transaction`SELECT pg_advisory_xact_lock(20260722)`;
        const rows = await transaction<{ data: Database }[]>`SELECT data FROM bible_app_state WHERE id = 1 FOR UPDATE`;
        const db = rows[0]?.data || emptyDb();
        const result = await fn(db);
        await transaction`UPDATE bible_app_state SET data = ${transaction.json(db)}, updated_at = NOW() WHERE id = 1`;
        return result;
      }) as Promise<T>;
    })();
  }
  const operation = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function hashPassword(password: string) {
  const salt = randomUUID();
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function logActivity(db: Database, userId: string, type: string, detail: string) {
  const activity: Activity = { id: randomUUID(), userId, type, detail, createdAt: new Date().toISOString() };
  db.activities.unshift(activity);
  db.activities = db.activities.slice(0, 5000);
}
