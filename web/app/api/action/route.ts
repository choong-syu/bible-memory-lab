import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { hashPassword, logActivity, mutateDb, readDb } from "@/lib/store";
import type { Attempt, Database, QuizOptions, SelectionRef } from "@/lib/types";

const normalize = (value: string) => value.replace(/[\s.,!?~·'"“”‘’()]/g, "").toLowerCase();
const safeSelections = (value: unknown): SelectionRef[] => Array.isArray(value) ? value.filter((item) => item && typeof item.key === "string" && typeof item.surface === "string") : [];

function wrongSelections(db: Database, attempt: Attempt) {
  const quiz = db.quizzes.find((item) => item.id === attempt.quizId);
  if (!quiz) return [];
  return quiz.selections.filter((selection) => normalize(String(attempt.answers[selection.key] || "")) !== normalize(selection.surface));
}

function wrongReviews(db: Database, userId: string) {
  return db.attempts
    .filter((attempt) => attempt.userId === userId)
    .map((attempt) => {
      const quiz = db.quizzes.find((item) => item.id === attempt.quizId);
      const selections = wrongSelections(db, attempt);
      return {
        id: attempt.id,
        quizId: attempt.quizId,
        title: quiz?.title || "빈칸문제",
        bookName: quiz?.bookName || selections[0]?.bookName || "",
        chapter: quiz?.chapter || selections[0]?.chapter,
        answers: attempt.answers,
        selections,
        correct: attempt.correct,
        total: attempt.total,
        createdAt: attempt.createdAt,
      };
    })
    .filter((review) => review.selections.length > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

let bibleCache: any;
async function bibleSource() {
  if (!bibleCache) bibleCache = JSON.parse(await readFile(path.join(process.cwd(), "public", "bible-verses.json"), "utf8"));
  return bibleCache;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json();
  const action = String(body.action || "");

  if (action === "adminOverview" || action === "adminResetPassword" || action === "adminAddNoun" || action === "adminDeleteNoun") {
    if (session.role !== "admin") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    if (action === "adminAddNoun") {
      const bookCode = String(body.bookCode || "");
      const chapter = Number(body.chapter);
      const verse = Number(body.verse);
      const surface = String(body.surface || "").trim();
      const source = await bibleSource();
      const book = source.books.find((item: any) => item.bookCode === bookCode);
      const chapterData = book?.chapters.find((item: any) => item.chapter === chapter);
      const verseData = chapterData?.verses.find((item: any) => item.verse === verse);
      if (!verseData || !surface) return NextResponse.json({ error: "장절과 추가할 명사를 확인해 주세요." }, { status: 400 });
      const requestedStart = Number.isInteger(Number(body.start)) ? Number(body.start) : -1;
      const start = requestedStart >= 0 && verseData.text.slice(requestedStart, requestedStart + surface.length) === surface
        ? requestedStart
        : verseData.text.indexOf(surface);
      if (start < 0) return NextResponse.json({ error: "해당 절에서 입력한 단어를 찾을 수 없습니다." }, { status: 400 });
      const overlaps = (noun: any) => start < noun.start + noun.length && noun.start < start + surface.length;
      if (verseData.nouns.some(overlaps)) return NextResponse.json({ error: "이미 명사로 선택할 수 있는 영역입니다." }, { status: 400 });
      const noun = await mutateDb((db) => {
        db.nounOverrides ||= [];
        if (db.nounOverrides.some((item) => item.bookCode === bookCode && item.chapter === chapter && item.verse === verse && overlaps(item))) {
          throw new Error("이미 관리자가 추가한 명사와 겹칩니다.");
        }
        const item = { id: randomUUID(), bookCode, chapter, verse, start, length: surface.length, surface, createdAt: new Date().toISOString() };
        db.nounOverrides.push(item);
        return item;
      });
      return NextResponse.json({ noun });
    }
    if (action === "adminDeleteNoun") {
      await mutateDb((db) => { db.nounOverrides = (db.nounOverrides || []).filter((item) => item.id !== body.id); });
      return NextResponse.json({ ok: true });
    }
    if (action === "adminResetPassword") {
      const password = String(body.password || "");
      if (password.length < 4) return NextResponse.json({ error: "새 비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
      await mutateDb((db) => {
        const user = db.users.find((item) => item.id === body.userId);
        if (!user) throw new Error("사용자를 찾을 수 없습니다.");
        user.passwordHash = hashPassword(password);
        logActivity(db, user.id, "PASSWORD_RESET", "관리자가 비밀번호를 초기화함");
      });
      return NextResponse.json({ ok: true });
    }
    const db = await readDb();
    const users = db.users.map((user) => ({
      id: user.id, username: user.username, name: user.name, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt,
      passwordStatus: "암호화 저장됨",
      counts: {
        selections: db.selectionHistories.filter((item) => item.userId === user.id).length,
        quizzes: db.quizzes.filter((item) => item.userId === user.id).length,
        attempts: db.attempts.filter((item) => item.userId === user.id).length,
        wrongs: wrongReviews(db, user.id).length,
      },
    }));
    return NextResponse.json({
      users,
      activities: db.activities.slice(0, 500).map((item) => ({ ...item, user: db.users.find((user) => user.id === item.userId)?.username || "알 수 없음" })),
      nounOverrides: db.nounOverrides || [],
    });
  }

  if (session.role !== "user") return NextResponse.json({ error: "일반 사용자 기능입니다." }, { status: 403 });
  const userId = session.sub;

  if (action === "dashboard") {
    const db = await readDb();
    return NextResponse.json({
      drafts: db.drafts.filter((item) => item.userId === userId),
      histories: db.selectionHistories.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      quizzes: db.quizzes.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      attempts: db.attempts.filter((item) => item.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      wrongNotes: wrongReviews(db, userId),
    });
  }

  if (action === "saveDraft") {
    const selections = safeSelections(body.selections);
    await mutateDb((db) => {
      const key = (item: any) => item.userId === userId && item.bookCode === body.bookCode && item.chapter === Number(body.chapter);
      const existing = db.drafts.find(key);
      const draft = { userId, bookCode: String(body.bookCode), chapter: Number(body.chapter), selections, updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, draft); else db.drafts.push(draft);
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "saveHistory") {
    const selections = safeSelections(body.selections);
    if (!selections.length) return NextResponse.json({ error: "선택한 명사가 없습니다." }, { status: 400 });
    const history = await mutateDb((db) => {
      const item = { id: randomUUID(), userId, title: String(body.title || `${body.bookName} ${body.chapter}장 단어 선택`), bookCode: String(body.bookCode), bookName: String(body.bookName), chapter: Number(body.chapter), selections, createdAt: new Date().toISOString() };
      db.selectionHistories.unshift(item);
      logActivity(db, userId, "SELECTION_SAVED", `${item.title} · ${selections.length}개 명사`);
      return item;
    });
    return NextResponse.json({ history });
  }

  if (action === "createQuiz" || action === "createWrongQuiz") {
    const dbSnapshot = await readDb();
    const selections = action === "createWrongQuiz"
      ? wrongReviews(dbSnapshot, userId).filter((item) => (body.ids || []).includes(item.id)).flatMap((item) => item.selections)
      : safeSelections(body.selections);
    if (!selections.length) return NextResponse.json({ error: "출제할 명사가 없습니다." }, { status: 400 });
    const options: QuizOptions = { firstLetter: Boolean(body.options?.firstLetter), stars: Boolean(body.options?.stars) };
    const quiz = await mutateDb((db) => {
      const first = selections[0];
      const item = { id: randomUUID(), userId, title: String(body.title || `${first.bookName} ${first.chapter}장 빈칸문제`), sourceHistoryId: body.sourceHistoryId ? String(body.sourceHistoryId) : undefined, bookCode: first.bookCode, bookName: first.bookName, chapter: first.chapter, selections, options, createdAt: new Date().toISOString() };
      db.quizzes.unshift(item);
      logActivity(db, userId, action === "createWrongQuiz" ? "WRONG_RETRY_CREATED" : "QUIZ_CREATED", `${item.title} · ${selections.length}개 빈칸`);
      return item;
    });
    return NextResponse.json({ quiz });
  }

  if (action === "submitAttempt") {
    const answers = body.answers && typeof body.answers === "object" ? body.answers as Record<string, string> : {};
    const result = await mutateDb((db) => {
      const quiz = db.quizzes.find((item) => item.id === body.quizId && item.userId === userId);
      if (!quiz) throw new Error("문제를 찾을 수 없습니다.");
      let correct = 0;
      for (const selection of quiz.selections) {
        const answer = String(answers[selection.key] || "");
        const isCorrect = normalize(answer) === normalize(selection.surface);
        if (isCorrect) correct += 1;
        const existing = db.wrongNotes.find((item) => item.userId === userId && item.key === selection.key);
        if (!isCorrect) {
          if (existing) { existing.wrongCount += 1; existing.lastWrongAnswer = answer; existing.lastWrongAt = new Date().toISOString(); }
          else db.wrongNotes.push({ ...selection, id: randomUUID(), userId, wrongCount: 1, correctCount: 0, lastWrongAnswer: answer, firstWrongAt: new Date().toISOString(), lastWrongAt: new Date().toISOString() });
        } else if (existing) { existing.correctCount += 1; existing.lastCorrectAt = new Date().toISOString(); }
      }
      const attempt = { id: randomUUID(), userId, quizId: quiz.id, answers, correct, total: quiz.selections.length, createdAt: new Date().toISOString() };
      db.attempts.unshift(attempt);
      logActivity(db, userId, "QUIZ_SUBMITTED", `${quiz.title} · ${correct}/${attempt.total}`);
      return attempt;
    });
    return NextResponse.json({ attempt: result });
  }

  return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
