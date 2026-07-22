# 말씀기억 연구소

기존 `bible-verses.json`의 명사 위치만 선택하여 사용자별 선택 기록, 빈칸문제,
풀이 결과와 오답노트를 저장하는 Next.js 사이트입니다.

## 로컬 실행

```powershell
Copy-Item ..\data\bible-verses.json public\bible-verses.json
npm install
Copy-Item .env.example .env.local
npm run dev
```

사용자 데이터는 `DATA_DIR/app-db.json`에 저장됩니다. 비밀번호는 scrypt 해시만
보관하며 관리자는 비밀번호 원문을 볼 수 없고 초기화만 할 수 있습니다.

Vercel처럼 영구 파일 저장을 지원하지 않는 환경에서는 `DATABASE_URL`을 설정하면
PostgreSQL의 단일 트랜잭션 상태 저장소를 자동으로 사용합니다.

## 환경변수

- `ADMIN_PASSWORD`: 관리자 로그인 비밀번호
- `SESSION_SECRET`: 로그인 세션 서명 키
- `DATA_DIR`: 영구 사용자 데이터 디렉터리
- `COOKIE_SECURE`: HTTPS를 적용한 뒤 `true`로 변경
- `DATABASE_URL`: Vercel/서버리스 환경에서 사용하는 PostgreSQL 연결 문자열
