# Tasko - 비트벳 바이낸스 게임 (BitBet) 프로젝트 기능 총정리

**프로젝트**: 비트코인 가격 움직임을 예측하는 30초 1라운드 미니게임 플랫폼
**주요 기능**: 회원가입/로그인 → 배팅 게임 → 결과 정산 → 관리자 대시보드

---

## 📱 사용자 페이지 (User Pages)

### 1. **/ (메인 대시보드)**
- **경로**: `/app/page.tsx`
- **기능**:
  - 비트코인 실시간 차트 표시
  - 30초 미니게임 배팅 인터페이스 (롱/숏, 오버/언더, 홀/짝)
  - 최근 라운드 종료가 목록
  - 프로젝트 분석/통계 대시보드
  - 사이드바 네비게이션
  - 톱바 (사용자 잔고, 프로필)

### 2. **/widget (네온 스타일 게임)**
- **경로**: `/app/widget/page.tsx`
- **기능**:
  - 네온 테마의 고급 시각화
  - 원형 타이머 (30초 카운트다운)
  - 색상 구분된 롱/숏·오버/언더·홀/짝 배팅 버튼
  - 결과 팝업 시트
  - Orbitron 폰트를 사용한 숫자 표시
  - `/` 대시보드와 동일한 게임 로직

### 3. **/widget2 (추가 위젯)**
- **경로**: `/app/widget2/page.tsx`
- **기능**: 테스트/개발용 추가 게임 뷰

### 4. **/tasks (작업 관리)**
- **경로**: `/app/tasks/page.tsx`
- **기능**: 사용자 작업 추적 기능

### 5. **/calendar (캘린더)**
- **경로**: `/app/calendar/page.tsx`
- **기능**: 이벤트/일정 관리

### 6. **/analytics (분석)**
- **경로**: `/app/analytics/page.tsx`
- **기능**:
  - 배팅 기록 분석
  - 수익/손실 통계
  - 승률 분석
  - 라운드별 성과 추이

### 7. **/settings (설정)**
- **경로**: `/app/settings/page.tsx`
- **기능**:
  - 사용자 프로필 설정
  - 비밀번호 변경
  - 계정 설정

### 8. **/help (도움말)**
- **경로**: `/app/help/page.tsx`
- **기능**: FAQ 및 게임 규칙 설명

### 9. **/logout (로그아웃)**
- **경로**: `/app/logout/page.tsx`
- **기능**: 세션 종료

### 10. **/panel (관리자 패널)**
- **경로**: `/app/panel/page.tsx`
- **기능**: 관리자 대시보드 (자세히 아래 참고)

### 11. **/mas (MAS 페이지)**
- **경로**: `/app/mas/page.tsx`
- **기능**: 추가 마스터데이터 관리 페이지

---

## 🔐 인증 API (Auth)

### 1. **POST /api/auth/register**
- **기능**: 사용자 회원가입
- **입력**: `email`, `password`, `username`
- **출력**: `user`, `token`, `error`
- **처리**: 이메일 중복 확인 → 비밀번호 해싱 → 사용자 생성 → JWT 토큰 발급

### 2. **POST /api/auth/login**
- **기능**: 사용자 로그인
- **입력**: `email`, `password`
- **출력**: `user`, `token`, `error`
- **처리**: 이메일/비밀번호 검증 → JWT 토큰 발급 → localStorage에 저장

---

## 💰 사용자 잔고 API (User Balance)

### 1. **GET /api/user/balance**
- **기능**: 현재 잔고 조회
- **출력**: `balance` (숫자)
- **인증**: Bearer 토큰 필요

### 2. **GET /api/user/balance/stream**
- **기능**: 실시간 잔고 업데이트 (SSE 스트림)
- **출력**: 연속적인 balance 업데이트
- **용도**: 배팅 후 즉시 잔고 반영

---

## 🎮 게임 배팅 API (Game Betting)

### 1. **POST /api/user/game/bet**
- **기능**: 배팅 금액 등록 (실제 배팅은 아직 미체결)
- **입력**: `betAmount` (숫자)
- **출력**: `newBalance`, `error`
- **처리**: 잔고 확인 → 배팅 금액 차감 → 새로운 잔고 반환
- **주의**: 배팅 가능 시간 (15초 이상) 체크

### 2. **GET /api/user/game/play**
- **기능**: 라운드 게임 결과 조회
- **출력**: `result`, `closingPrice`, `wonDirection`, `wonDigit`, `wonParity`
- **처리**:
  1. 현재 라운드 번호 계산 (unix time / 30)
  2. 해당 라운드의 종료가 (30초 후) 조회
  3. 사용자 배팅 정보와 비교하여 승/패 판정
  4. 승리 시 배팅금 × 1.95배 지급

---

## 📊 라운드 데이터 API

### 1. **GET /api/closing-price**
- **기능**: 최근 100개 라운드의 종료가 목록
- **출력**: `prices` 배열 (time, price)
- **용도**: 차트 렌더링, 히스토리 표시

### 2. **GET /api/rounds**
- **기능**: 최근 라운드 정보 (배팅 이력 포함)
- **출력**: `rounds` 배열 (id, started_at, ended_at, closing_price, bet_history[])
- **bet_history 필드**:
  - `bet_direction`: "long" | "short" | null
  - `bet_digit`: "over" | "under" | null
  - `bet_parity`: "odd" | "even" | null
  - `result`: "win" | "lose" | null (최종 정산 결과)

---

## 👥 사용자 정보 API

### 1. **GET /api/user/profile**
- **기능**: 현재 로그인 사용자 정보
- **출력**: `id`, `email`, `username`, `balance`, `stats`

### 2. **POST /api/user/branch/join**
- **기능**: 사용자가 지사(branch) 가입
- **입력**: `branchId`
- **처리**: 사용자와 지사 연결, 초기 잔고 설정

---

## 🏢 지사(Branch) 관리 API

### 1. **POST /api/user/branch/join**
- **기능**: 지사 가입 (사용자 측)
- **입력**: `branchId`
- **출력**: `success`, `initialBalance`

---

## 🎰 파리 게임 API (Pari - 승리배당식 게임)

### 1. **POST /api/pari/bet**
- **기능**: 파리 게임 배팅
- **입력**: `betAmount`, `selection`
- **출력**: `newBalance`, `error`

### 2. **GET /api/pari/play**
- **기능**: 파리 게임 결과 조회
- **출력**: `result`, `payout`

### 3. **GET /api/pari/pool**
- **기능**: 파리 게임 풀(풀량) 정보
- **출력**: `totalPool`, `winnerCount`, `payoutPerShare`

---

## 👨‍💼 관리자 API (Admin)

### 1. **GET /api/admin/users**
- **기능**: 모든 사용자 목록 조회
- **인증**: 관리자 권한 필요 (SUPER_ADMIN_ID, SUPER_ADMIN_PASSWORD)
- **출력**: `users` 배열 (id, email, username, balance, createdAt)

### 2. **POST /api/admin/charge**
- **기능**: 사용자 잔고 충전 (관리자)
- **입력**: `userId`, `amount`
- **처리**: 직접 잔고 추가
- **인증**: 관리자 권한 필요

### 3. **GET /api/admin/branches**
- **기능**: 모든 지사(branch) 목록 조회
- **출력**: `branches` 배열 (id, name, totalUsers, totalBalance)

### 4. **GET /api/admin/branches/betting**
- **기능**: 지사별 배팅 통계
- **출력**: `statistics` (각 지사의 배팅액, 배당금, 수익 등)

### 5. **POST /api/admin/branches/:id**
- **기능**: 지사 정보 수정
- **입력**: `name`, `initialBalance`

### 6. **GET /api/admin/lp-history**
- **기능**: LP(유동성 공급자) 거래 내역
- **출력**: `lpHistory` (추가/회수 기록)

### 7. **POST /api/admin/verify-password**
- **기능**: 관리자 비밀번호 검증
- **입력**: `password`
- **출력**: `valid` (true | false)
- **용도**: 관리자 기능 사용 시 비밀번호 재입력

---

## 🤖 AI 채팅 API

### 1. **POST /api/chat**
- **기능**: AI 어시스턴트와 대화
- **입력**: `messages`, `model`
- **출력**: `response` (AI 응답 스트리밍)
- **라이브러리**: Vercel AI SDK (OpenAI, Anthropic 등)

---

## 🎮 게임 로직 상세

### 라운드 시간 구조
```
30초 1라운드
┌─────────────────────────────────────┐
│ 0-15초: 배팅 가능 구간              │
│ 15-30초: 배팅 불가 구간 (결과 대기) │
└─────────────────────────────────────┘
```

### 배팅 종목
1. **롱/숏 (Direction)**
   - 롱: 다음 30초 후 종료가 > 시작가 → 승
   - 숏: 다음 30초 후 종료가 < 시작가 → 승

2. **오버/언더 (Digit Over/Under)**
   - 종료가의 마지막 한 자리 숫자 기준
   - 언더: 0-4 (0, 1, 2, 3, 4)
   - 오버: 5-9 (5, 6, 7, 8, 9)

3. **홀/짝 (Parity)**
   - 종료가의 마지막 한 자리 숫자 기준
   - 홀: 홀수 (1, 3, 5, 7, 9)
   - 짝: 짝수 (0, 2, 4, 6, 8)

### 배당률
- 기본 배당률: **1.95배** (배팅금 포함)
- 예: 10,000원 배팅 시 승리 → 19,500원 (수익 9,500원)
- 예: 10,000원 배팅 시 패배 → 0원 (손실 10,000원)

### 배팅 잠금/고정 기능
- 배팅 금액을 고정해 다음 라운드도 동일 금액 자동 선택
- "고정" 버튼 활성화 시 "배팅 ₩10,000으로 고정됨" 표시
- "해제" 버튼으로 초기화 가능

### 자동 배팅 (Auto-Bet)
- **설정 가능 항목**:
  - 종목: 없음/고정(롱·숏·오버·언더·홀·짝)/랜덤
  - 금액: 칩 선택 (10K ~ 100K)
  - 최대 라운드: 무제한 또는 N라운드
  - 손실 한도: 무제한 또는 ₩N

- **작동 원리**:
  1. "시작" 버튼 누른 현재 라운드는 건너뜀
  2. 다음 라운드 배팅 구간(15초 초과)부터 자동 실행
  3. 종료 조건 만족 시 자동 중단

- **종료 조건**:
  - 최대 라운드 도달 (예: 10라운드 완료)
  - 누적 손실 한도 도달 (예: -100,000원)
  - 수동 중단 버튼 클릭

---

## 📈 실시간 가격 수집

### Price Server (WebSocket)
- **위치**: `/price-server/index.js`
- **기능**:
  1. Binance WebSocket API에 연결
  2. Trade 스트림: 1초마다 최신 거래가 수신
  3. Kline 스트림: 30초마다 캔들 종료가 (closing price) 수신
  4. 클라이언트들에게 브로드캐스트

- **데이터 형식**:
  ```json
  {
    "type": "price",  // 또는 "closing"
    "price": 66235.9,
    "time": 1710000000  // unix seconds
  }
  ```

---

## 🎨 UI 컴포넌트

### 메인 게임 컴포넌트
- **BettingGame** (`/components/dashboard/betting-game.tsx`)
  - 기본 스타일 게임 인터페이스
  - 롱/숏, 오버/언더, 홀/짝 버튼 그리드
  - 배팅 모달 (금액 선택)
  - 결과 시트

- **NeonBettingGame** (`/components/widget/neon-betting-game.tsx`)
  - 네온 스타일 고급 UI
  - 원형 타이머
  - 색상 구분 배팅 버튼
  - 자동 배팅 패널

### 차트 컴포넌트
- **BitcoinChart** (`/components/dashboard/bitcoin-chart.tsx`)
  - Recharts 라이브러리 사용
  - 실시간 캔들 차트
  - 4시간, 1시간, 15분 시간프레임

- **NeonChart** (`/components/widget/neon-chart.tsx`)
  - 네온 테마 차트

### 종료가 히스토리
- **ClosingPrices** (`/components/dashboard/closing-prices.tsx`)
  - 최근 라운드 종료가 목록
  - 배팅 종목 태그 (초록/빨강/흐림)
  - 승/패 컬러 표시

- **NeonClosingPrices** (`/components/widget/neon-closing-prices.tsx`)
  - 네온 스타일 종료가 목록

---

## 🔄 상태 관리 방식

### 게임 상태 (React State)
- `timeLeft`: 라운드 시간 (0-30초)
- `roundNumber`: 현재 라운드 번호
- `betDirection/Digit/Parity`: 배팅한 종목
- `phase`: "betting" | "waiting" | "result"
- `balance`: 사용자 현재 잔고
- `lastResult`: 최근 라운드 결과

### 자동 배팅 상태
```typescript
interface AutoBetConfig {
  enabled: boolean                // ON/OFF
  direction: "long" | "short" | "random" | null
  digit: "over" | "under" | "random" | null
  parity: "odd" | "even" | "random" | null
  amount: number                  // 배팅 금액
  maxRounds: number | null        // 최대 라운드
  maxLoss: number | null          // 손실 한도
}
```

---

## 🔑 저장소 구조 (Supabase)

### Tables
- `users`: 사용자 계정 (email, username, balance_history)
- `bet_history`: 배팅 기록 (user_id, round_id, direction, digit, parity, amount, result)
- `branches`: 지사 정보 (name, admin_id, total_balance)
- `lp_history`: LP 거래 내역

---

## 🛠️ 개발 기술 스택

- **Frontend**: Next.js 16, React 19, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui
- **Charts**: Recharts
- **Real-time**: WebSocket (Binance API, Price Server)
- **Backend**: Supabase (PostgreSQL + Auth)
- **AI**: Vercel AI SDK
- **Package Manager**: pnpm

---

## 📝 주요 기능 정리표

| 기능 | 경로 | 상태 | 설명 |
|------|------|------|------|
| 회원가입 | `/api/auth/register` | ✅ | 새 계정 생성 |
| 로그인 | `/api/auth/login` | ✅ | JWT 토큰 발급 |
| 메인 게임 | `/` | ✅ | 기본 스타일 배팅 인터페이스 |
| 네온 게임 | `/widget` | ✅ | 고급 스타일 배팅 인터페이스 |
| 배팅 고정 | `/components/*/betting-game.tsx` | ✅ | 금액 고정 저장 |
| 자동 배팅 | `/components/*/betting-game.tsx` | ✅ | 종료 조건까지 자동 실행 |
| 잔고 조회 | `/api/user/balance` | ✅ | 현재 보유 자금 |
| 배팅 실행 | `/api/user/game/bet` | ✅ | 라운드 배팅 |
| 결과 조회 | `/api/user/game/play` | ✅ | 라운드 결과 및 정산 |
| 종료가 목록 | `/api/closing-price` | ✅ | 히스토리 |
| 분석 대시보드 | `/analytics` | ✅ | 승률, 수익 통계 |
| 지사 관리 | `/api/admin/*` | ✅ | 지사 생성, 사용자 관리 |
| 관리자 충전 | `/api/admin/charge` | ✅ | 사용자 잔고 수동 충전 |
| AI 채팅 | `/api/chat` | ✅ | AI 어시스턴트 |

---

## 🚀 배포 및 운영

- **호스팅**: Vercel
- **DB**: Supabase (클라우드 PostgreSQL)
- **실시간 데이터**: 로컬 WebSocket 서버 (price-server)
- **환경 변수**: `.env.local` (Supabase API 키, 관리자 비번 등)

---

**최종 업데이트**: 2026년 3월 9일
