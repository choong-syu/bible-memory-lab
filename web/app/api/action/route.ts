import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/lib/auth";
import { hashPassword, logActivity, mutateDb, readDb } from "@/lib/store";
import type { Database, QuizOptions, SelectionRef } from "@/lib/types";

const normalize = (value: string) => value.replace(/[\s.,!?~·'"“”‘’()]/g, "").toLowerCase();
const safeSelections = (value: unknown): SelectionRef[] => Array.isArray(value) ? value.filter((item) => item && typeof item.key === "string" && typeof item.surface === "string") : [];

function mergeImportedDatabase(target: Database, source: Database) {
  const userIdMap = new Map<string, string>();
  const historyIdMap = new Map<string, string>();
  const quizIdMap = new Map<string, string>();

  for (const importedUser of source.users || []) {
    const existing = target.users.find((user) => user.username.toLowerCase() === importedUser.username.toLowerCase());
    if (existing) {
      userIdMap.set(importedUser.id, existing.id);
      if (!existing.lastLoginAt || (importedUser.lastLoginAt && importedUser.lastLoginAt > existing.lastLoginAt)) {
        existing.lastLoginAt = importedUser.lastLoginAt;
      }
    } else {
      target.users.push(importedUser);
      userIdMap.set(importedUser.id, importedUser.id);
    }
  }

  const mappedUserId = (id: string) => userIdMap.get(id) || id;
  const appendById = <T extends { id: string }>(items: T[], item: T) => {
    if (!items.some((existing) => existing.id === item.id)) items.push(item);
  };

  for (const item of source.activities || []) appendById(target.activities, { ...item, userId: mappedUserId(item.userId) });
  for (const item of source.drafts || []) {
    const mapped = { ...item, userId: mappedUserId(item.userId) };
    const existing = target.drafts.find((draft) => draft.userId === mapped.userId && draft.bookCode === mapped.bookCode && draft.chapter === mapped.chapter);
    if (!existing) target.drafts.push(mapped);
    else if (mapped.updatedAt > existing.updatedAt) Object.assign(existing, mapped);
  }
  for (const item of source.selectionHistories || []) {
    const existing = target.selectionHistories.find((history) => history.id === item.id);
    historyIdMap.set(item.id, existing?.id || item.id);
    if (!existing) target.selectionHistories.push({ ...item, userId: mappedUserId(item.userId) });
  }
  for (const item of source.quizzes || []) {
    const existing = target.quizzes.find((quiz) => quiz.id === item.id);
    quizIdMap.set(item.id, existing?.id || item.id);
    if (!existing) target.quizzes.push({
      ...item,
      userId: mappedUserId(item.userId),
      sourceHistoryId: item.sourceHistoryId ? historyIdMap.get(item.sourceHistoryId) || item.sourceHistoryId : undefined,
    });
  }
  for (const item of source.attempts || []) appendById(target.attempts, {
    ...item,
    userId: mappedUserId(item.userId),
    quizId: quizIdMap.get(item.quizId) || item.quizId,
  });
  for (const item of source.wrongNotes || []) appendById(target.wrongNotes, { ...item, userId: mappedUserId(item.userId) });

  return {
    users: target.users.length,
    activities: target.activities.length,
    drafts: target.drafts.length,
    selectionHistories: target.selectionHistories.length,
    quizzes: target.quizzes.length,
    attempts: target.attempts.length,
    wrongNotes: target.wrongNotes.length,
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const body = await request.json();
  const action = String(body.action || "");

  if (action === "adminOverview" || action === "adminResetPassword" || action === "adminImportData") {
    if (session.role !== "admin") return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
    if (action === "adminImportData") {
      const source = body.database as Database;
      if (!source || !Array.isArray(source.users) || !Array.isArray(source.selectionHistories)) {
        return NextResponse.json({ error: "올바른 데이터 파일이 아닙니다." }, { status: 400 });
      }
      const counts = await mutateDb((db) => mergeImportedDatabase(db, source));
      return NextResponse.json({ ok: true, counts });
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
        wrongs: db.wrongNotes.filter((item) => item.userId === user.id && item.wrongCount > item.correctCount).length,
      },
    }));
    return NextResponse.json({ users, activities: db.activities.slice(0, 500).map((item) => ({ ...item, user: db.users.find((user) => user.id === item.userId)?.username || "알 수 없음" })) });
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
      wrongNotes: db.wrongNotes.filter((item) => item.userId === userId).sort((a, b) => b.lastWrongAt.localeCompare(a.lastWrongAt)),
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
      ? dbSnapshot.wrongNotes.filter((item) => item.userId === userId && (body.ids || []).includes(item.id)).map(({ id, userId: _, wrongCount, correctCount, lastWrongAnswer, firstWrongAt, lastWrongAt, lastCorrectAt, ...selection }) => selection)
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
