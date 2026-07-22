import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

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
  return NextResponse.json({ bookCode, bookName: book.bookName, chapter: chapterNumber, verses: chapter.verses });
}
