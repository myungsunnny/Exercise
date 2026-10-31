# MyFit AI

개인용 올인원 AI 헬스 트레이너 웹앱. Next.js 16 · TypeScript · Tailwind 4 · shadcn/ui · Supabase.

설계와 단계별 구현 현황은 [docs/SPEC.md](docs/SPEC.md)를 참고하세요. 현재 **Phase 1**(운동 기록·루틴·라이브러리·대시보드)이 구현되어 있습니다.

## 설치

### 1. Supabase 프로젝트

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다(리전: Northeast Asia (Seoul) 권장).
2. **SQL Editor**에서 `supabase/migrations/` 파일을 이름 순서대로 실행합니다.
   - `20261031000001_phase1_core.sql` → `20261031000002_seed_exercises.sql`
3. **Authentication → Sign In / Providers**에서 `Allow new users to sign up`을 **끕니다**(단일 사용자 운영).
4. **Authentication → Users → Add user**로 본인 계정(이메일+비밀번호, Auto Confirm)을 만듭니다.
5. **Project Settings → API Keys**에서 Project URL과 Publishable key를 복사합니다.
   Secret(service_role) 키는 이 앱에 넣지 마세요.

### 2. 환경 변수

```bash
cp .env.example .env.local
```

`.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 채웁니다.

### 3. 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 로그인합니다.

## 테스트

```bash
npm test            # 단위 테스트 + DB 테스트(PGlite로 마이그레이션·RPC·RLS 검증, Supabase 불필요)
npm run typecheck
npm run lint
```

E2E(Playwright, 실제 Supabase 필요): `.env.local`에 `E2E_EMAIL`, `E2E_PASSWORD`(테스트용 계정)를 넣은 뒤

```bash
npx playwright install chromium
npm run test:e2e
```

E2E는 테스트 계정의 진행 중 운동을 취소하고 기록을 만들었다가 삭제합니다. 실제 운동 기록이 있는 계정과 분리하는 것을 권장합니다.

## 배포 (Vercel)

저장소를 Vercel에 연결하고 위 두 환경 변수를 등록하면 됩니다. Supabase **Authentication → URL Configuration**의 Site URL을 배포 주소로 바꿉니다.
