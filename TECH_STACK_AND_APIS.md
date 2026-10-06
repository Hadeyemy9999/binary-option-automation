# Technology Stack & Free APIs Architecture Specification

This document details the recommended technology stack, architectural decisions, and a curated list of free/freemium APIs required to build the market analysis, signal generation, Telegram broadcasting, SMS dispatching, and subscriber web platform.

---

## 1. End-to-End Technology Stack

To ensure sub-second signal latency, real-time dashboard updates, low hosting costs, and production reliability, the following modern stack is recommended:

```
+---------------------------------------------------------------------------------+
|                                FRONTEND DASHBOARD                               |
|   - Framework: Next.js 14+ (App Router, React, TypeScript)                     |
|   - Styling: Tailwind CSS + Shadcn UI (radix-ui accessible components)          |
|   - Real-Time Updates: Socket.io-client / Server-Sent Events (SSE)              |
|   - Charts: Lightweight Charts (TradingView open-source library)               |
|   - Audio Alerts: Web Audio API (Synthesized chimes on new signals)             |
+---------------------------------------------------------------------------------+
                                        | (REST / WebSockets)
                                        v
+---------------------------------------------------------------------------------+
|                                BACKEND & ENGINE                                 |
|   - Primary API & Dispatcher: Node.js / Express or NestJS (TypeScript)          |
|   - Indicator & Quantitative Engine: Python (FastAPI / pandas-ta / TA-Lib)       |
|     * Node.js handles fast async alerts, Telegram, SMS, auth, and web routing.  |
|     * Python handles market scanning & complex technical indicator math.        |
+---------------------------------------------------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+----------------------------------+        +-------------------------------------+
|        DATABASE & STORAGE        |        |           QUEUE & CACHE             |
| - PostgreSQL (via Supabase/Neon) |        | - Redis (Upstash Serverless Redis)  |
| - Prisma ORM / Drizzle ORM       |        | - BullMQ (Job queue for Telegram    |
| - Tracks users, signals & results|        |   & SMS broadcast workers)          |
+----------------------------------+        +-------------------------------------+
```

### Detailed Layer Breakdown:

| Layer | Recommended Technology | Why This Choice? | Free / Self-Hostable Tier |
| :--- | :--- | :--- | :--- |
| **Frontend Web App** | **Next.js (React) + TypeScript** | Server-side rendering for SEO landing pages, client components for live dashboards. | Free on Vercel or VPS |
| **UI Components** | **Tailwind CSS + Shadcn UI** | High-performance, sleek dark-mode trading theme without heavy third-party UI libraries. | 100% Free / Open Source |
| **Interactive Charting** | **TradingView Lightweight Charts** | Extremely fast HTML5 canvas charts built specifically for financial time-series. | 100% Free / Open Source |
| **API & Telegram Dispatcher** | **Node.js (TypeScript)** | Non-blocking event loop; can dispatch hundreds of Telegram and socket events simultaneously. | Free on VPS / Railway / Render |
| **Analysis Engine** | **Python (FastAPI + pandas-ta)** | Clean technical analysis calculation with NumPy and pandas. | Free on VPS |
| **Database** | **PostgreSQL (Supabase or Neon)** | Relational data for users, signal logs, win/loss records. | Free generous tiers |
| **Queue / Background Tasks** | **Redis + BullMQ** | Decouples signal detection from SMS/Telegram delivery so slow SMS gateways do not block alerts. | Free on Upstash Redis |

---

## 2. API Catalog & Free Tier Analysis

Here is the breakdown of all external APIs required, focusing on generous free tiers.

### 2.1 Market Data APIs (Free Tiers)

Market data feeds fuel your analysis engine to generate indicators and detect setups.

| Provider | Data Coverage | Free Tier Allowance | Best Used For |
| :--- | :--- | :--- | :--- |
| **Binance WebSocket API** | Crypto pairs (BTC, ETH, SOL, XRP) | **100% Free & Unlimited** (No API key required for public ticker/kline streams). | Real-time 1m/5m crypto signals; sub-second price streaming. |
| **Twelve Data** | Major Forex (EUR/USD, GBP/USD, USD/JPY), Stocks, Crypto | **800 credits/day** (~8 API requests/minute); free WebSockets on limited tier. | Forex historical OHLCV data for backtesting & initial candle calculations. |
| **Finnhub.io** | Forex, Stocks, Economic Calendar | **60 calls / minute** (free API key). | Real-time Forex quote checking and economic news releases. |
| **Alpha Vantage** | Forex, Crypto, Technical Indicators | **25 requests / day** (free tier). | Good backup for daily macro trend context. |
| **Yahoo Finance (Unofficial `yfinance`)** | Global Forex & Commodities (Gold, Silver) | **Free, rate-limited**. | Fetching multi-year historical candles for strategy backtesting. |

---

### 2.2 Alert & Notification APIs

| Channel | Service | Free Tier / Cost Structure | Feasibility & Strategy |
| :--- | :--- | :--- | :--- |
| **Telegram** | **Telegram Bot API** | **100% FREE (Unlimited)** | • **Primary Channel**.<br>• Sub-200ms latency.<br>• Supports markdown, rich action buttons, sound notifications, and unlimited channel subscribers. |
| **SMS** | **Twilio** | **$15 Free Trial Credit** (Pay-as-you-go thereafter: ~$0.0079 / SMS in US). | • Use trial credit for development and testing.<br>• For production: Offer SMS as a paid VIP upgrade to cover carrier fees. |
| **SMS (Alternative)** | **Textbelt** | **1 free SMS / day** (Development testing). | Perfect for integration testing without setting up full accounts. |
| **SMS (Alternative)** | **Telnyx / Sinch** | Cheaper per-SMS pricing than Twilio; low initial deposit. | Production scaling when expanding globally. |
| **Web Push Alerts** | **Web Push API (VAPID)** | **100% FREE & Unlimited** | • Native browser push notifications to desktop and mobile Chrome/Safari even when tab is in background. |
| **Discord (Bonus)** | **Discord Webhooks** | **100% FREE** | Free alternative alert channel to build community alongside Telegram. |

---

### 2.3 Macro & Economic News Filter APIs (Crucial for Binary Options)

Binary options strategies fail during sudden news spikes. An automated news filter shuts down signals during "Red Folder" announcements.

| Provider | Purpose | Free Tier |
| :--- | :--- | :--- |
| **Finnhub Economic Calendar API** | Ingests CPI, NFP, GDP, and central bank interest rate release dates & times. | Included in free 60 req/min tier. |
| **Forex Factory (Scraper / RSS feed)** | Live calendar of high-impact events with visual impact rating (Low, Medium, High). | Free via RSS or public endpoints. |

---

### 2.4 Authentication, Database & Hosting APIs (Free Tiers)

| Service | Category | Free Tier Details |
| :--- | :--- | :--- |
| **Supabase** | Database & Auth | 500 MB Postgres database, 50,000 monthly active users, built-in Auth (Google, Email/Password). |
| **Upstash Redis** | Caching & Job Queue | 10,000 commands / day free (more than enough for MVP signal queues). |
| **Vercel** | Frontend Hosting | Generous free hobby tier for Next.js web application. |
| **Render / Railway** | Backend Service Hosting | Free/low-cost tiers with automated GitHub CI/CD deployments. |

---

## 3. Recommended Hybrid Signal Architecture

To make development **fast, professional, and reliable**, use a **Hybrid Signal Engine**:

```
[ METHOD 1: TradingView Webhooks (Immediate Zero-Code Analysis) ]
  • Use free TradingView accounts with custom Pine Script strategies.
  • When a buy/sell condition triggers, TradingView sends a POST request:
    POST https://api.yourdomain.com/v1/signals/incoming
  • Payloads arrive instantly with exact pair, direction, and expiry.

[ METHOD 2: Internal Python/Node Ticker Engine (Full Independence) ]
  • Connects to Binance WebSocket & Twelve Data / Finnhub Forex polls.
  • Evaluates moving averages (EMA 20/50), RSI (14), and Bollinger Bands on each candle close.
  • Dispatches signals independently without relying on third-party charting tools.
```

---

## 4. Signal Life Cycle Flow (Sub-Second Latency)

```
1. TRIGGER:
   Signal Engine detects: EUR/USD RSI Oversold (22) + Lower Band Touch on 5M timeframe.

2. FILTER:
   Economic Calendar API checked: No high-impact USD/EUR news in next 30 minutes? -> APPROVED.

3. PERSISTENCE:
   Inserted into PostgreSQL database (status: PENDING, entry_price: 1.08520, expiry: 5m).

4. BROADCAST:
   - Dispatched immediately to BullMQ queue:
     ├── Job A: Telegram Bot API -> Sends formatted alert to Public & VIP channels (< 150ms).
     ├── Job B: WebSocket Server -> Emits event to active web dashboard users (< 50ms) + sound alert.
     └── Job C: SMS Worker -> Sends text alert to opted-in VIP SMS phone numbers.

5. VERIFICATION:
   After 5 minutes, worker fetches closing price from market API:
   - Closing price > Entry price? -> Result: WIN (ITM).
   - Updates database and sends Telegram confirmation: "EUR/USD 5M Signal: WIN (+85%)".
```
