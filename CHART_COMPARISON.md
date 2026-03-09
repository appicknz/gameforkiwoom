# "/" vs "/widget" 차트 구현 비교

## 요약
**같은 캔들스틱 차트지만, 데이터 소스와 업데이트 방식이 완전히 다릅니다.**

---

## 1️⃣ "/" 경로 차트 (대시보드) - `BitcoinChart`

### 파일
- **컴포넌트**: `components/dashboard/bitcoin-chart.tsx`
- **차트 라이브러리**: `lightweight-charts` (TradingView)
- **특징**: 시간 단위 캔들 + 여러 인터벌 지원 (1초, 30초, 1분, 1시간, 1일)

### 데이터 가져오기
```
1. 초기 데이터: Binance REST API 직접 호출 (klines 엔드포인트)
   - https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=200
   - 시간대별로 선택 가능

2. 실시간 업데이트: window 전역 변수 구독
   - window.__bitcoinCurrentPrice (현재가)
   - window.__bitcoinClosingPrices (마감가 배열)
   - 이 값들은 BettingGame의 usePriceWorker가 관리
```

### 차트 렌더링
```
- 캔들스틱: addCandlestickSeries()
- 상승: 녹색 (#00e676)
- 하강: 빨간색 (#ff3d57)
- 인터벌 선택 가능 (UI에 버튼 제공)
- 마감가 수평선: 노란색
```

### 특징
✅ 여러 시간대 지원 (시간대별 캔들 다르게 표시)
✅ 사용자가 인터벌을 선택 가능
✅ BettingGame과 동일한 데이터 소스 공유
✅ 가격 데이터는 BettingGame이 관리 (window 변수로 공유)

---

## 2️⃣ "/widget" 경로 차트 (위젯) - `GameChart`

### 파일
- **컴포넌트**: `components/game/game-chart.tsx`
- **차트 라이브러리**: `lightweight-charts` (TradingView)
- **특징**: 1분 단위 고정 캔들

### 데이터 가져오기
```
1. 초기 데이터: Binance REST API 직접 호출 (고정)
   - https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=60
   - 항상 1분 기준 60개 (지난 1시간)

2. 실시간 업데이트: usePriceWorker Hook
   - WebSocket 또는 Railway API로 1초마다 실시간 가격 수신
   - onPrice 콜백으로 가격 받음
   - 1분 단위 버킷으로 OHLC 계산
```

### 차트 렌더링
```
- 캔들스틱: addCandlestickSeries()
- 상승: 녹색 (#00e676)
- 하강: 빨간색 (#ff3d57)
- 고정: 1분 캔들만 표시
- 마감가 수평선: 노란색
```

### 특징
✅ 1분 단위 고정
✅ usePriceWorker로 직접 실시간 데이터 받음
✅ 독립적인 차트 (window 공유 변수 사용 안 함)
✅ 게임 로직과 긴밀하게 연결됨 (onClosingPrice 콜백)

---

## 🔄 핵심 차이점

| 항목 | "/" (BitcoinChart) | "/widget" (GameChart) |
|------|------|------|
| **데이터 소스** | window 전역 변수 (BettingGame 공급) | usePriceWorker Hook (독립 수신) |
| **인터벌** | 여러 개 지원 (1초~1일) | 1분 고정 |
| **초기 캔들 개수** | 200개 (1분 기준) | 60개 (1분 기준) |
| **실시간 업데이트 방식** | 폴링 (setInterval 500ms) | usePriceWorker (직접 콜백) |
| **다른 컴포넌트 의존도** | BettingGame의 usePriceWorker 의존 | 독립적 |
| **UI 인터벌 선택** | 있음 (버튼) | 없음 (고정) |
| **마감가 수평선** | setClosingPrices 상태로 관리 | priceLineRef로 직접 관리 |

---

## 📊 데이터 흐름

### "/" 경로
```
Binance API
    ↓
BitcoinChart 초기 데이터
    ↓
BettingGame usePriceWorker → window.__bitcoinCurrentPrice
    ↓
BitcoinChart 폴링 (500ms) → window 변수 읽기 → 차트 업데이트
```

### "/widget" 경로
```
Binance API
    ↓
GameChart 초기 데이터 (60개 1분 캔들)
    ↓
GameChart usePriceWorker (1초마다 가격 수신)
    ↓
1분 단위 버킷으로 OHLC 계산 → 차트 업데이트
    ↓
onClosingPrice 콜백으로 게임 로직에 알림
```

---

## 🎯 각 설계의 의도

### BitcoinChart (/)
- **목적**: 사용자가 시간대별로 차트를 볼 수 있는 분석 도구
- **특징**: 유연한 인터벌, 데이터 공유 중심
- **역할**: 정보성 메인 대시보드

### GameChart (/widget)
- **목적**: 게임 진행 상황을 실시간으로 표시하는 전용 차트
- **특징**: 1분 고정, 독립적 실시간 수신
- **역할**: 게임 진행에 필요한 실시간 가격 표시 + 게임 로직 연동

---

## 결론
**같은 캔들스틱 차트이지만 용도가 다릅니다:**
- **BitcoinChart**: "분석용" (여러 인터벌, 사용자 선택 가능)
- **GameChart**: "게임용" (1분 고정, 게임 로직과 동기화)

둘 다 수정할 이유가 없습니다. 각자 역할에 최적화되어 있습니다.
