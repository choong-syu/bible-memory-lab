import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "./types";

const COOKIE = "bible_session";
const secret = () => process.env.SESSION_SECRET || "local-bible-session-change-me";

type Payload = { sub: string; role: Role; exp: number };

function sign(value: string) { return createHmac("sha256", secret()).update(value).digest("base64url"); }

export function createToken(sub: string, role: Role) {
  const body = Buffer.from(JSON.stringify({ sub, role, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export async function getSession(): Promise<Payload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const actual = Buffer.from(signature);
  const expected = Buffer.from(sign(body));
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try { const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload; return payload.exp > Date.now() ? payload : null; }
  catch { return null; }
}

export async function setSession(sub: string, role: Role) {
  (await cookies()).set(COOKIE, createToken(sub, role), {
    httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true", path: "/", maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearSession() { (await cookies()).delete(COOKIE); }
