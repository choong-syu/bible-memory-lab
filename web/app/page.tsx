"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SessionUser = { id: string; name: string; username: string; role: "user" | "admin" };
type Selection = { key: string; bookCode: string; bookName: string; chapter: number; verse: number; start: number; length: number; surface: string };
type Noun = { surface: string; start: number; length: number; posLabel: string; overrideId?: string };
type Verse = { verse: number; text: string; nouns: Noun[] };
type ChapterData = { bookCode: string; bookName: string; chapter: number; verses: Verse[] };
type Quiz = { id: string; title: string; bookCode: string; bookName: string; chapter: number; selections: Selection[]; options: { firstLetter: boolean; stars: boolean }; createdAt: string };

const BOOKS = [
  { code: "Mk", name: "마가복음", chapters: 16 },
  { code: "1Pe", name: "베드로전서", chapters: 5 },
  { code: "2Pe", name: "베드로후서", chapters: 3 },
  { code: "1Jn", name: "요한일서", chapters: 3 },
];

const dateTime = (value?: string) => value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "기록 없음";

async function api(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function Home() {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [tab, setTab] = useState("read");
  const [dashboard, setDashboard] = useState<any>({ drafts: [], histories: [], quizzes: [], attempts: [], wrongNotes: [] });
  const [activeQuiz, setActiveQuiz] = useState<Quiz | null>(null);
  const [readerTarget, setReaderTarget] = useState<any>(null);

  const loadSession = useCallback(async () => setUser((await api("/api/auth")).user), []);
  const refresh = useCallback(async () => {
    if (user?.role === "user") setDashboard(await api("/api/action", { action: "dashboard" }));
  }, [user]);

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { refresh(); }, [refresh]);

  if (user === undefined) return <div className="center-loading"><span className="brand-mark">말씀</span><p>학습 공간을 준비하고 있어요.</p></div>;
  if (!user) return <AuthScreen onSuccess={loadSession} />;

  const logout = async () => { await api("/api/auth", { action: "logout" }); setUser(null); };
  if (user.role === "admin") return <AdminDashboard onLogout={logout} />;

  const openReader = (history: any) => {
    setReaderTarget({ bookCode: history.bookCode, chapter: history.chapter, selections: history.selections, nonce: Date.now() });
    setActiveQuiz(null); setTab("read");
  };

  const navItems = [
    ["read", "성경 읽기"], ["history", "선택 기록"], ["quizzes", "빈칸문제"], ["wrong", "오답노트"],
  ];

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setTab("read"); setActiveQuiz(null); }}><span className="brand-mark">말씀</span><span>기억 연구소<small>읽고, 고르고, 기억하기</small></span></button>
        <div className="user-area"><span><b>{user.name}</b>님</span><button className="ghost" onClick={logout}>로그아웃</button></div>
      </header>
      <nav className="main-nav" aria-label="주요 메뉴">
        {navItems.map(([id, label]) => <button key={id} className={tab === id && !activeQuiz ? "active" : ""} onClick={() => { setTab(id); setActiveQuiz(null); }}>{label}{id === "wrong" && dashboard.wrongNotes.length > 0 && <em>{dashboard.wrongNotes.length}</em>}</button>)}
      </nav>

      {activeQuiz ? <QuizRunner quiz={activeQuiz} onBack={() => { setActiveQuiz(null); refresh(); }} /> :
        tab === "read" ? <Reader dashboard={dashboard} target={readerTarget} onChanged={refresh} onQuiz={setActiveQuiz} /> :
        tab === "history" ? <HistoryList items={dashboard.histories} onOpen={openReader} onQuiz={async (item: any) => { const result = await api("/api/action", { action: "createQuiz", title: `${item.title} 빈칸문제`, sourceHistoryId: item.id, selections: item.selections, options: { firstLetter: false, stars: false } }); await refresh(); setActiveQuiz(result.quiz); }} /> :
        tab === "quizzes" ? <QuizHistory quizzes={dashboard.quizzes} attempts={dashboard.attempts} onOpen={setActiveQuiz} /> :
        <WrongNotes items={dashboard.wrongNotes} onQuiz={async (ids) => { const result = await api("/api/action", { action: "createWrongQuiz", ids, title: "오답 다시 풀기", options: { firstLetter: false, stars: false } }); await refresh(); setActiveQuiz(result.quiz); }} />}
    </main>
  );
}

function AuthScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register" | "admin">("login");
  const [form, setForm] = useState({ name: "", username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(""); setBusy(true);
    try { await api("/api/auth", { action: mode === "admin" ? "adminLogin" : mode, ...form }); await onSuccess(); }
    catch (e) { setError(e instanceof Error ? e.message : "로그인에 실패했습니다."); }
    finally { setBusy(false); }
  };
  return <main className="auth-page">
    <section className="auth-story"><span className="eyebrow">BIBLE MEMORY STUDIO</span><h1>말씀을 고르고,<br />기억을 만들어 보세요.</h1><p>성경 속 명사만 골라 아이들을 위한 빈칸문제를 만들고, 오답을 차근차근 다시 익힐 수 있습니다.</p><div className="verse-quote">“주의 말씀은 내 발에 등이요<br />내 길에 빛이니이다”<small>시편 119:105</small></div></section>
    <section className="auth-card">
      <div className="mobile-logo"><span className="brand-mark">말씀</span> 기억 연구소</div>
      <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>로그인</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>회원가입</button></div>
      <form onSubmit={submit}>
        <h2>{mode === "admin" ? "관리자 접속" : mode === "register" ? "새 학습자 등록" : "다시 만나 반가워요"}</h2>
        <p>{mode === "admin" ? "관리자 비밀번호를 입력하세요." : mode === "register" ? "간단한 정보로 바로 시작할 수 있어요." : "아이디와 비밀번호를 입력해 주세요."}</p>
        {mode === "register" && <label>이름<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="이름" autoComplete="name" /></label>}
        {mode !== "admin" && <label>아이디<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="아이디" autoComplete="username" /></label>}
        <label>비밀번호<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="비밀번호" autoComplete={mode === "register" ? "new-password" : "current-password"} /></label>
        {error && <div className="error-box">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy ? "처리 중..." : mode === "register" ? "회원가입하고 시작하기" : "로그인"}</button>
      </form>
      <button className="admin-link" onClick={() => { setMode(mode === "admin" ? "login" : "admin"); setError(""); }}>{mode === "admin" ? "일반 사용자 로그인" : "관리자 접속"}</button>
    </section>
  </main>;
}

function Reader({ dashboard, target, onChanged, onQuiz }: any) {
  const [bookCode, setBookCode] = useState(target?.bookCode || "Mk");
  const [chapter, setChapter] = useState(target?.chapter || 11);
  const [data, setData] = useState<ChapterData | null>(null);
  const [selected, setSelected] = useState<Selection[]>(target?.selections || []);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [showQuizOptions, setShowQuizOptions] = useState(false);
  const [options, setOptions] = useState({ firstLetter: false, stars: false });

  useEffect(() => { if (target) { setBookCode(target.bookCode); setChapter(target.chapter); setSelected(target.selections || []); } }, [target]);
  useEffect(() => {
    api(`/api/bible?book=${bookCode}&chapter=${chapter}`).then((chapterData) => {
      setData(chapterData);
      if (!target || target.bookCode !== bookCode || target.chapter !== chapter) {
        const draft = dashboard.drafts.find((item: any) => item.bookCode === bookCode && item.chapter === chapter);
        setSelected(draft?.selections || []);
      }
      setTitle(`${chapterData.bookName} ${chapter}장 단어 선택`);
    });
  }, [bookCode, chapter, dashboard.drafts, target]);

  const selectedKeys = useMemo(() => new Set(selected.map((item) => item.key)), [selected]);
  const toggle = async (selection: Selection) => {
    const next = selectedKeys.has(selection.key) ? selected.filter((item) => item.key !== selection.key) : [...selected, selection];
    setSelected(next);
    await api("/api/action", { action: "saveDraft", bookCode, chapter, selections: next });
  };
  const saveHistory = async () => {
    try { await api("/api/action", { action: "saveHistory", title, bookCode, bookName: data?.bookName, chapter, selections: selected }); setMessage("현재 선택을 새 히스토리로 저장했습니다."); await onChanged(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "저장하지 못했습니다."); }
  };
  const createQuiz = async () => {
    try { const result = await api("/api/action", { action: "createQuiz", title: `${data?.bookName} ${chapter}장 빈칸문제`, selections: selected, options }); await onChanged(); onQuiz(result.quiz); }
    catch (e) { setMessage(e instanceof Error ? e.message : "문제를 만들지 못했습니다."); }
  };
  const book = BOOKS.find((item) => item.code === bookCode)!;
  return <section className="content reader-page">
    <div className="page-heading"><div><span className="eyebrow">READ & MARK</span><h1>성경 읽기</h1><p>파란 점선이 있는 명사만 선택할 수 있습니다. 선택은 자동으로 임시 저장됩니다.</p></div><div className="selection-count"><b>{selected.length}</b><span>선택한 명사</span></div></div>
    <div className="reader-toolbar">
      <label>성경<select value={bookCode} onChange={(e) => { setBookCode(e.target.value); setChapter(1); }}>{BOOKS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
      <label>장<select value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>{Array.from({ length: book.chapters }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}장</option>)}</select></label>
      <div className="toolbar-spacer" />
      <button className="secondary" onClick={() => setSelected([])}>선택 초기화</button><button className="primary" onClick={saveHistory}>선택 저장</button><button className="dark" onClick={() => setShowQuizOptions(!showQuizOptions)}>빈칸문제 만들기</button>
    </div>
    {showQuizOptions && <div className="quiz-options"><div><b>문제 표시 방법</b><span>복합명사는 하나의 입력칸으로 출제됩니다.</span></div><label><input type="checkbox" checked={options.firstLetter} onChange={(e) => setOptions({ ...options, firstLetter: e.target.checked })} /> 첫 글자 힌트</label><label><input type="checkbox" checked={options.stars} onChange={(e) => setOptions({ ...options, stars: e.target.checked })} /> 별표로 글자 수</label><button className="primary" onClick={createQuiz}>문제 생성</button></div>}
    {message && <div className="notice">{message}</div>}
    <div className="chapter-title"><span>{data?.bookName}</span><strong>{chapter}</strong><span>장</span></div>
    <div className="verses">
      {data?.verses.map((verse) => <div className="verse-row" key={verse.verse}><span className="verse-number">{verse.verse}</span><p><VerseText verse={verse} selectedKeys={selectedKeys} onToggle={(noun) => toggle({ key: `${bookCode}:${chapter}:${verse.verse}:${noun.start}:${noun.length}`, bookCode, bookName: data.bookName, chapter, verse: verse.verse, start: noun.start, length: noun.length, surface: noun.surface })} /></p></div>)}
    </div>
    <div className="save-strip"><input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="저장 제목" /><button className="primary" onClick={saveHistory}>현재 선택을 히스토리에 저장</button></div>
  </section>;
}

function VerseText({ verse, selectedKeys, onToggle }: { verse: Verse; selectedKeys: Set<string>; onToggle: (noun: Noun) => void }) {
  const parts: React.ReactNode[] = []; let cursor = 0;
  verse.nouns.forEach((noun, index) => {
    parts.push(verse.text.slice(cursor, noun.start));
    const localSuffix = `:${verse.verse}:${noun.start}:${noun.length}`;
    const selected = [...selectedKeys].some((key) => key.endsWith(localSuffix));
    parts.push(<button type="button" key={`${noun.start}-${index}`} className={`noun-token ${selected ? "selected" : ""}`} title={`${noun.posLabel} · 클릭하여 ${selected ? "해제" : "선택"}`} onClick={() => onToggle(noun)}>{verse.text.slice(noun.start, noun.start + noun.length)}</button>);
    cursor = noun.start + noun.length;
  });
  parts.push(verse.text.slice(cursor)); return <>{parts}</>;
}

function HistoryList({ items, onOpen, onQuiz }: any) {
  return <section className="content"><div className="page-heading"><div><span className="eyebrow">SELECTION HISTORY</span><h1>선택 기록</h1><p>저장 시점의 파란 명사를 그대로 다시 열거나 문제로 만들 수 있습니다.</p></div></div>{!items.length ? <Empty text="아직 저장한 선택 기록이 없습니다." /> : <div className="record-list">{items.map((item: any) => <article className="selection-list-item" key={item.id}><div className="selection-list-main"><span className="record-type">{item.bookName} {item.chapter}장</span><h3>{item.title}</h3><p className="selection-preview">{item.selections.slice(0, 8).map((selection: Selection) => selection.surface).join(" · ")}{item.selections.length > 8 ? ` 외 ${item.selections.length - 8}개` : ""}</p><time>{dateTime(item.createdAt)}</time></div><div className="selection-list-count"><b>{item.selections.length}</b><span>선택 명사</span></div><div className="selection-list-actions"><button className="secondary" onClick={() => onOpen(item)}>기록 열기</button><button className="primary" onClick={() => onQuiz(item)}>문제 만들기</button></div></article>)}</div>}</section>;
}

function QuizHistory({ quizzes, attempts, onOpen }: any) {
  return <section className="content"><div className="page-heading"><div><span className="eyebrow">QUIZ LIBRARY</span><h1>빈칸문제</h1><p>저장된 문제와 최근 풀이 결과를 확인하세요.</p></div></div>{!quizzes.length ? <Empty text="아직 만든 빈칸문제가 없습니다." /> : <div className="record-list">{quizzes.map((quiz: Quiz) => { const recent = attempts.find((a: any) => a.quizId === quiz.id); return <article className="quiz-card" key={quiz.id}><div><span className="record-type">{quiz.bookName} {quiz.chapter}장</span><h3>{quiz.title}</h3><p>빈칸 {quiz.selections.length}개 · {dateTime(quiz.createdAt)}</p></div>{recent && <div className="score"><b>{Math.round(recent.correct / recent.total * 100)}</b><span>최근 점수</span></div>}<button className="primary" onClick={() => onOpen(quiz)}>문제 풀기</button></article>; })}</div>}</section>;
}

function QuizRunner({ quiz, onBack }: { quiz: Quiz; onBack: () => void }) {
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState<any>(null);
  const [verseHints, setVerseHints] = useState<Record<string, { stars: boolean; firstLetter: boolean }>>({});
  useEffect(() => {
    const ranges = [...new Set(quiz.selections.map((s) => `${s.bookCode}:${s.chapter}`))];
    Promise.all(ranges.map((range) => { const [book, ch] = range.split(":"); return api(`/api/bible?book=${book}&chapter=${ch}`); })).then(setChapters);
  }, [quiz]);
  const selectedByVerse = useMemo(() => {
    const map = new Map<string, Selection[]>();
    quiz.selections.forEach((s) => { const key = `${s.bookCode}:${s.chapter}:${s.verse}`; map.set(key, [...(map.get(key) || []), s]); }); return map;
  }, [quiz]);
  const resetVerse = (key: string) => { const next = { ...answers }; (selectedByVerse.get(key) || []).forEach((s) => delete next[s.key]); setAnswers(next); setChecked((old) => { const value = new Set(old); value.delete(key); return value; }); };
  const toggleHint = (key: string, hint: "stars" | "firstLetter") => setVerseHints((current) => ({
    ...current,
    [key]: {
      stars: hint === "stars" ? !current[key]?.stars : Boolean(current[key]?.stars),
      firstLetter: hint === "firstLetter" ? !current[key]?.firstLetter : Boolean(current[key]?.firstLetter),
    },
  }));
  const submit = async () => { const result = await api("/api/action", { action: "submitAttempt", quizId: quiz.id, answers }); setSubmitted(result.attempt); setChecked(new Set(selectedByVerse.keys())); };
  return <section className="content quiz-page"><button className="back" onClick={onBack}>← 문제 목록으로</button><div className="page-heading"><div><span className="eyebrow">FILL IN THE BLANKS</span><h1>{quiz.title}</h1><p>빈칸은 모두 하나의 명사입니다. 띄어쓰기 차이는 정답에 영향을 주지 않습니다.</p></div>{submitted && <div className="result-badge"><b>{submitted.correct}/{submitted.total}</b><span>정답</span></div>}</div>
    <div className="option-summary">{quiz.options.firstLetter && <span>첫 글자 힌트</span>}{quiz.options.stars && <span>글자 수 표시</span>}<span>총 {quiz.selections.length}문제</span></div>
    <div className="quiz-sheet">{chapters.map((chapter) => <div key={`${chapter.bookCode}:${chapter.chapter}`}><h2>{chapter.bookName} {chapter.chapter}장</h2>{chapter.verses.filter((v) => selectedByVerse.has(`${chapter.bookCode}:${chapter.chapter}:${v.verse}`)).map((verse) => { const key = `${chapter.bookCode}:${chapter.chapter}:${verse.verse}`; const selections = selectedByVerse.get(key)!; const hints = verseHints[key] || { stars: false, firstLetter: false }; return <div className="quiz-verse" key={key}><div className="quiz-text"><span className="verse-number">{verse.verse}</span><p><BlankText verse={verse} selections={selections} answers={answers} checked={checked.has(key)} options={{ stars: quiz.options.stars || hints.stars, firstLetter: quiz.options.firstLetter || hints.firstLetter }} onAnswer={(id: string, value: string) => setAnswers({ ...answers, [id]: value })} /></p></div><div className="verse-actions"><button className="secondary" onClick={() => setChecked(new Set([...checked, key]))}>정답 체크</button><button className={hints.stars ? "hint-button active" : "hint-button"} onClick={() => toggleHint(key, "stars")}>글자 수 힌트</button><button className={hints.firstLetter ? "hint-button active" : "hint-button"} onClick={() => toggleHint(key, "firstLetter")}>첫글자 힌트</button><button className="ghost" onClick={() => resetVerse(key)}>빈칸 초기화</button></div></div>; })}</div>)}</div>
    <div className="submit-bar"><button className="secondary" onClick={() => { setAnswers({}); setChecked(new Set()); setSubmitted(null); }}>전체 초기화</button><button className="dark" onClick={submit}>전체 채점하고 저장</button></div>
  </section>;
}

function BlankText({ verse, selections, answers, checked, options, onAnswer }: any) {
  const sorted = [...selections].sort((a, b) => a.start - b.start); const parts: React.ReactNode[] = []; let cursor = 0;
  sorted.forEach((s: Selection) => { parts.push(verse.text.slice(cursor, s.start)); const answer = answers[s.key] || ""; const correct = answer.replace(/\s/g, "") === s.surface.replace(/\s/g, ""); const hint = options.firstLetter ? s.surface.split(" ").map((part: string) => part[0] + (options.stars ? "*".repeat(Math.max(0, part.length - 1)) : "_")).join(" ") : options.stars ? s.surface.split("").map((char: string) => char === " " ? " " : "*").join("") : "정답 입력"; parts.push(<span className="blank-wrap" key={s.key}><input value={answer} onChange={(e) => onAnswer(s.key, e.target.value)} placeholder={hint} className={checked ? correct ? "correct" : "incorrect" : ""} aria-label={`${verse.verse}절 빈칸`} />{checked && !correct && <small>입력: {answer || "(미입력)"} · 정답: <b>{s.surface}</b></small>}</span>); cursor = s.start + s.length; }); parts.push(verse.text.slice(cursor)); return <>{parts}</>;
}

function WrongNotes({ items, onQuiz }: { items: any[]; onQuiz: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected(items.map((item) => item.id)), [items]);
  return <section className="content"><div className="page-heading"><div><span className="eyebrow">REVIEW NOTE</span><h1>오답노트</h1><p>실제로 풀었던 빈칸문제별로 틀린 문제만 모았습니다.</p></div><button className="dark" disabled={!selected.length} onClick={() => onQuiz(selected)}>선택한 문제 다시 풀기</button></div>{!items.length ? <Empty text="아직 틀린 빈칸문제가 없습니다. 아주 좋아요!" /> : <div className="wrong-review-list">{items.map((item) => <article className="wrong-review-card" key={item.id}><label className="wrong-review-head"><input type="checkbox" checked={selected.includes(item.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, item.id] : selected.filter((id) => id !== item.id))} /><div><span className="record-type">{item.bookName} {item.chapter}장 · {dateTime(item.createdAt)}</span><h3>{item.title}</h3><p>총 {item.total}개 중 {item.selections.length}개 오답</p></div><div className="score wrong-score"><b>{item.total - item.selections.length}/{item.total}</b><span>정답</span></div></label><div className="wrong-question-list">{item.selections.map((selection: Selection) => <div key={selection.key}><span>{selection.bookName} {selection.chapter}장 {selection.verse}절</span><b>{selection.surface}</b><small>입력: {item.answers[selection.key] || "(미입력)"}</small></div>)}</div><button className="primary wrong-retry" onClick={() => onQuiz([item.id])}>이 오답만 다시 풀기</button></article>)}</div>}</section>;
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<any>({ users: [], activities: [], nounOverrides: [] }); const [query, setQuery] = useState(""); const [error, setError] = useState("");
  const load = useCallback(() => api("/api/action", { action: "adminOverview" }).then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const users = data.users.filter((u: any) => `${u.username} ${u.name}`.toLowerCase().includes(query.toLowerCase()));
  const resetPassword = async (user: any) => { const password = window.prompt(`${user.username}의 새 비밀번호를 입력하세요. (4자 이상)`); if (!password) return; try { await api("/api/action", { action: "adminResetPassword", userId: user.id, password }); window.alert("비밀번호를 초기화했습니다."); load(); } catch (e) { setError(e instanceof Error ? e.message : "초기화 실패"); } };
  return <main className="admin-shell"><header className="admin-top"><div><span className="brand-mark">관리</span><b>말씀기억 관리자</b></div><button className="ghost light" onClick={onLogout}>관리자 로그아웃</button></header><section className="admin-content"><div className="page-heading"><div><span className="eyebrow">ADMIN CONSOLE</span><h1>사용자 활동 현황</h1><p>사용자 현황과 학습에 사용할 명사 후보를 관리합니다.</p></div></div>{error && <div className="error-box">{error}</div>}<div className="admin-stats"><div><b>{data.users.length}</b><span>전체 사용자</span></div><div><b>{data.users.reduce((n: number, u: any) => n + u.counts.selections, 0)}</b><span>선택 기록</span></div><div><b>{data.users.reduce((n: number, u: any) => n + u.counts.quizzes, 0)}</b><span>생성 문제</span></div><div><b>{data.users.reduce((n: number, u: any) => n + u.counts.attempts, 0)}</b><span>풀이 횟수</span></div></div><AdminNounEditor overrides={data.nounOverrides} onChanged={load} /><div className="admin-grid"><section className="admin-panel"><div className="panel-title"><h2>사용자</h2><input placeholder="아이디 또는 이름 검색" value={query} onChange={(e) => setQuery(e.target.value)} /></div><div className="user-table"><div className="table-head"><span>계정</span><span>최근 로그인</span><span>활동</span><span>관리</span></div>{users.map((u: any) => <div className="table-row" key={u.id}><span><b>{u.name}</b><small>@{u.username} · {u.passwordStatus}</small></span><span>{dateTime(u.lastLoginAt)}</span><span><small>선택 {u.counts.selections} · 문제 {u.counts.quizzes}<br />풀이 {u.counts.attempts} · 오답 회차 {u.counts.wrongs}</small></span><span><button className="secondary" onClick={() => resetPassword(u)}>비밀번호 초기화</button></span></div>)}</div></section><section className="admin-panel activity-panel"><div className="panel-title"><h2>최근 활동</h2><span>{data.activities.length}건</span></div>{data.activities.slice(0, 80).map((a: any) => <div className="activity" key={a.id}><span className="activity-dot" /><div><b>{a.user}</b><p>{a.detail}</p><time>{dateTime(a.createdAt)}</time></div></div>)}</section></div></section></main>;
}

function AdminNounEditor({ overrides, onChanged }: { overrides: any[]; onChanged: () => void }) {
  const [bookCode, setBookCode] = useState("Mk");
  const [chapter, setChapter] = useState(1);
  const [data, setData] = useState<ChapterData | null>(null);
  const [verse, setVerse] = useState(1);
  const [surface, setSurface] = useState("");
  const [selectedStart, setSelectedStart] = useState(-1);
  const [message, setMessage] = useState("");
  const book = BOOKS.find((item) => item.code === bookCode)!;
  useEffect(() => { api(`/api/bible?book=${bookCode}&chapter=${chapter}`).then((result) => { setData(result); setVerse(result.verses[0]?.verse || 1); }); }, [bookCode, chapter, overrides]);
  const chooseText = (selectedVerse: Verse, text: string, start: number) => { setVerse(selectedVerse.verse); setSurface(text); setSelectedStart(start); setMessage(`${selectedVerse.verse}절의 “${text}”를 추가할 수 있습니다.`); (document.querySelector("#admin-noun-input") as HTMLInputElement | null)?.focus(); };
  const add = async () => {
    try {
      const verseData = data?.verses.find((item) => item.verse === verse);
      const start = selectedStart >= 0 && verseData?.text.slice(selectedStart, selectedStart + surface.length) === surface ? selectedStart : verseData?.text.indexOf(surface) ?? -1;
      await api("/api/action", { action: "adminAddNoun", bookCode, chapter, verse, surface, start });
      setSurface(""); setSelectedStart(-1); setMessage("명사 후보를 추가했습니다."); await onChanged();
    } catch (e) { setMessage(e instanceof Error ? e.message : "추가하지 못했습니다."); }
  };
  const remove = async (id: string) => { await api("/api/action", { action: "adminDeleteNoun", id }); setMessage("추가 명사를 삭제했습니다."); await onChanged(); };
  return <section className="admin-panel noun-editor"><div className="panel-title"><div><h2>명사 후보 간편 추가</h2><p>아래 성경절에서 빠진 단어를 누르거나 직접 입력하세요. 회색 단어는 이미 명사로 등록되어 있습니다.</p></div><span>관리자 추가 {overrides.length}개</span></div><div className="noun-editor-toolbar"><label>성경<select value={bookCode} onChange={(e) => { setBookCode(e.target.value); setChapter(1); }}>{BOOKS.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>장<select value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>{Array.from({ length: book.chapters }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}장</option>)}</select></label><label>절<select value={verse} onChange={(e) => setVerse(Number(e.target.value))}>{data?.verses.map((item) => <option key={item.verse} value={item.verse}>{item.verse}절</option>)}</select></label><input id="admin-noun-input" value={surface} onChange={(e) => { setSurface(e.target.value); setSelectedStart(-1); }} placeholder="추가할 명사 또는 복합명사" /><button className="primary" disabled={!surface.trim()} onClick={add}>명사로 추가</button></div>{message && <div className="notice">{message}</div>}<div className="admin-verse-picker">{data?.verses.map((item) => { let tokenCursor = 0; return <div className={verse === item.verse ? "active" : ""} key={item.verse}><b>{item.verse}</b><p>{item.text.split(/(\s+)/).map((token, index) => { const start = tokenCursor; tokenCursor += token.length; const defined = item.nouns.some((noun) => start < noun.start + noun.length && noun.start < start + token.length); return /^\s+$/.test(token) ? token : <button key={index} disabled={defined} title={defined ? "이미 등록된 명사" : "클릭하여 명사 후보로 선택"} onClick={() => chooseText(item, token, start)}>{token}</button>; })}</p></div>; })}</div>{overrides.length > 0 && <div className="override-list">{overrides.map((item) => <span key={item.id}>{BOOKS.find((bookItem) => bookItem.code === item.bookCode)?.name} {item.chapter}:{item.verse} <b>{item.surface}</b><button aria-label={`${item.surface} 삭제`} onClick={() => remove(item.id)}>×</button></span>)}</div>}</section>;
}

function Empty({ text }: { text: string }) { return <div className="empty"><span>✦</span><h3>{text}</h3><p>성경 읽기에서 명사를 선택하면 기록이 시작됩니다.</p></div>; }
