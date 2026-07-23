const base = process.env.TEST_BASE_URL || "http://localhost:3000";
const post = async (path, body, cookie = "") => {
  const response = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.getSetCookie?.()[0]?.split(";")[0] || cookie };
};

const username = `smoke_${Date.now()}`;
const registered = await post("/api/auth", { action: "register", name: "Smoke Teacher", username, password: "test1234" });
const chapterResponse = await fetch(`${base}/api/bible?book=Mk&chapter=1`, { headers: { cookie: registered.cookie } });
const chapter = await chapterResponse.json();
const wantedStarts = new Set([10, 14, 25, 32, 37]);
const selections = chapter.verses[8].nouns.filter((noun) => wantedStarts.has(noun.start)).map((noun) => ({
  key: `Mk:1:9:${noun.start}:${noun.length}`,
  bookCode: "Mk", bookName: "Mark", chapter: 1, verse: 9,
  start: noun.start, length: noun.length, surface: noun.surface,
}));
if (selections.length !== 5) throw new Error(`Expected 5 selectable nouns, got ${selections.length}`);

const history = await post("/api/action", { action: "saveHistory", title: "Smoke history", bookCode: "Mk", bookName: "Mark", chapter: 1, selections }, registered.cookie);
const quiz = await post("/api/action", { action: "createQuiz", title: "Smoke quiz", selections, options: { firstLetter: true, stars: true } }, registered.cookie);
const answers = Object.fromEntries(selections.map((item) => [item.key, item.surface]));
answers[selections[0].key] = "wrong";
const attempt = await post("/api/action", { action: "submitAttempt", quizId: quiz.data.quiz.id, answers }, registered.cookie);
const dashboard = await post("/api/action", { action: "dashboard" }, registered.cookie);
const admin = await post("/api/auth", { action: "adminLogin", password: "bible" });
const overview = await post("/api/action", { action: "adminOverview" }, admin.cookie);
const addedNoun = await post("/api/action", { action: "adminAddNoun", bookCode: "Mk", chapter: 1, verse: 9, surface: "그", start: 0 }, admin.cookie);
const chapterWithOverrideResponse = await fetch(`${base}/api/bible?book=Mk&chapter=1`, { headers: { cookie: registered.cookie } });
const chapterWithOverride = await chapterWithOverrideResponse.json();
await post("/api/action", { action: "adminDeleteNoun", id: addedNoun.data.noun.id }, admin.cookie);

if (!history.data.history.id || !quiz.data.quiz.id) throw new Error("History or quiz was not created");
if (attempt.data.attempt.correct !== 4 || attempt.data.attempt.total !== 5) throw new Error("Unexpected score");
if (dashboard.data.wrongNotes.length !== 1 || dashboard.data.wrongNotes[0].selections.length !== 1) throw new Error("Wrong review was not grouped by quiz attempt");
if (!overview.data.users.some((user) => user.username === username)) throw new Error("Admin cannot see user");
if (!chapterWithOverride.verses[8].nouns.some((noun) => noun.overrideId === addedNoun.data.noun.id)) throw new Error("Admin noun override is not selectable");
console.log(JSON.stringify({ nouns: selections.map((item) => item.surface), score: "4/5", wrongReviewGrouped: true, adminNounOverride: true, adminUserVisible: true }));
