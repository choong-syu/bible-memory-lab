import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { clearSession, getSession, setSession } from "@/lib/auth";
import { hashPassword, logActivity, mutateDb, readDb, verifyPassword } from "@/lib/store";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ user: null });
  if (session.role === "admin") return NextResponse.json({ user: { id: "admin", name: "관리자", username: "admin", role: "admin" } });
  const db = await readDb();
  const user = db.users.find((item) => item.id === session.sub);
  return NextResponse.json({ user: user ? { id: user.id, name: user.name, username: user.username, role: "user" } : null });
}

export async function POST(request: Request) {
  const body = await request.json();
  const action = String(body.action || "");

  if (action === "logout") {
    await clearSession();
    return NextResponse.json({ ok: true });
  }

  if (action === "adminLogin") {
    if (String(body.password || "") !== (process.env.ADMIN_PASSWORD || "bible")) {
      return NextResponse.json({ error: "관리자 비밀번호가 올바르지 않습니다." }, { status: 401 });
    }
    await setSession("admin", "admin");
    return NextResponse.json({ ok: true });
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return NextResponse.json({ error: "아이디와 비밀번호를 입력해 주세요." }, { status: 400 });

  if (action === "register") {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "이름을 입력해 주세요." }, { status: 400 });
    if (password.length < 4) return NextResponse.json({ error: "비밀번호는 4자 이상이어야 합니다." }, { status: 400 });
    try {
      const user = await mutateDb((db) => {
        if (db.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) throw new Error("이미 사용 중인 아이디입니다.");
        const created = { id: randomUUID(), username, name, passwordHash: hashPassword(password), createdAt: new Date().toISOString(), lastLoginAt: new Date().toISOString() };
        db.users.push(created);
        logActivity(db, created.id, "REGISTER", "회원가입");
        return created;
      });
      await setSession(user.id, "user");
      return NextResponse.json({ ok: true });
    } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "회원가입에 실패했습니다." }, { status: 400 }); }
  }

  if (action === "login") {
    const user = await mutateDb((db) => {
      const found = db.users.find((item) => item.username.toLowerCase() === username.toLowerCase());
      if (!found || !verifyPassword(password, found.passwordHash)) return null;
      found.lastLoginAt = new Date().toISOString();
      logActivity(db, found.id, "LOGIN", "로그인");
      return found;
    });
    if (!user) return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
    await setSession(user.id, "user");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
}
