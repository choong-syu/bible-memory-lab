import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readDb } from "@/lib/store";

let cache: any;
async function bible() {
  if (!cache) cache = JSON.parse(await readFile(path.join(process.cwd(), "public", "bible-verses.json"), "utf8"));
  return cache;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const bookCode = searchParams.get("book") || "Mk";
  const chapterNumber = Number(searchParams.get("chapter") || 11);
  const data = await bible();
  const book = data.books.find((item: any) => item.bookCode === bookCode);
  const chapter = book?.chapters.find((item: any) => item.chapter === chapterNumber);
  if (!book || !chapter) return NextResponse.json({ error: "성경 범위를 찾을 수 없습니다." }, { status: 404 });
  const db = await readDb();
  const overrides = (db.nounOverrides || []).filter((item) => item.bookCode === bookCode && item.chapter === chapterNumber);
  const verses = chapter.verses.map((verse: any) => ({
    ...verse,
    nouns: [
      ...verse.nouns,
      ...overrides
        .filter((item) => item.verse === verse.verse)
        .map((item) => ({ surface: item.surface, lemma: item.surface, pos: "ADMIN", posLabel: "관리자 추가 명사", start: item.start, length: item.length, overrideId: item.id })),
    ].sort((a: any, b: any) => a.start - b.start),
  }));
  return NextResponse.json({ bookCode, bookName: book.bookName, chapter: chapterNumber, verses });
}
