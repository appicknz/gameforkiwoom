# market-site — Dissig Market

`dissig.com`에서 분리된 마켓 전용 Next.js 앱입니다.
Stripe 심사용 클린 사이트 — 바카라/도박 콘텐츠 없음.

## 배포 방법

1. 이 `market-site/` 폴더를 **별도 Git 저장소**로 분리하거나, Vercel 대시보드에서 Root Directory를 `market-site`로 지정합니다.
2. Vercel 프로젝트 생성 후 도메인을 `market.dissig.com`으로 설정합니다.
3. 아래 환경변수를 동일하게 복사합니다.

## 필요한 환경변수

기존 `dissig.com` Vercel 프로젝트의 환경변수를 그대로 복사하면 됩니다.
Supabase, Upstash Redis, Vercel Blob, Stripe, NowPayments, Malum 등 모두 동일한 인스턴스를 공유합니다.

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_JWT_SECRET
KV_REST_API_URL
KV_REST_API_TOKEN
BLOB_READ_WRITE_TOKEN
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
NOWPAYMENTS_API_KEY
NOWPAYMENTS_IPN_SECRET
MALUM_BUSINESS_ID
MALUM_SECRET_KEY
MALUM_WEBHOOK_KEY
NEXT_PUBLIC_TOKEN_SYMBOL
TOKEN_MINT_ADDRESS
SOLANA_RPC_HTTP
INTERNAL_SECRET
SUPER_ADMIN_ID
SUPER_ADMIN_PASSWORD
```

## 로컬 개발

```bash
pnpm install
pnpm dev   # http://localhost:3001
```

## 구조

- `/app/market` — 마켓 메인
- `/app/purchases` — 구매내역
- `/app/seller` — 판매관리
- `/app/settlement` — 정산관리
- `/app/deposit` — 토큰 충전
- `/app/api/*` — 관련 API 라우트
