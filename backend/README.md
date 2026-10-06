# Binary Options Automation & Signal API Backend

High-throughput, real-time backend service for the Binary Options Automated Analysis and Signal Alert broadcast system.

## Features
- **Authentication & Security**:
  - Email/Password registration with bcrypt password hashing
  - JWT Access Tokens (15m expiry) + Rotating Refresh Tokens (7d expiry)
  - Role-based authorization (`USER`, `VIP`, `ADMIN`) and subscription tiers (`FREE`, `PRO`, `VIP_SIGNALS`)
- **Signal Notification Integration**:
  - SMS phone number verification via 6-digit OTP codes
  - Telegram bot account linking tokens with 1-click deep links
- **Real-Time Live Signals**:
  - WebSocket server at `/ws/signals` for live tick & signal broadcast to web dashboards
- **Storage**:
  - High-performance SQLite via Node.js built-in `node:sqlite` (with WAL mode enabled)

---

## API Endpoints Reference

### 1. Public Authentication Endpoints

#### Register New User
- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Body**:
  ```json
  {
    "email": "trader@example.com",
    "password": "Password123!",
    "full_name": "Alex Trader",
    "phone_number": "+1234567890",
    "telegram_username": "@alextrader"
  }
  ```

#### Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Body**:
  ```json
  {
    "email": "trader@example.com",
    "password": "Password123!"
  }
  ```

#### Refresh Access Token
- **Method**: `POST`
- **Path**: `/api/v1/auth/refresh`
- **Body**:
  ```json
  {
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }
  ```

#### Logout
- **Method**: `POST`
- **Path**: `/api/v1/auth/logout`
- **Body**:
  ```json
  {
    "refresh_token": "YOUR_REFRESH_TOKEN"
  }
  ```

---

### 2. Protected Endpoints (Requires `Authorization: Bearer <access_token>`)

#### Get Current User Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`

#### Request Phone OTP (SMS Verification)
- **Method**: `POST`
- **Path**: `/api/v1/auth/phone/send-otp`
- **Body**:
  ```json
  {
    "phone_number": "+1234567890"
  }
  ```

#### Verify Phone OTP
- **Method**: `POST`
- **Path**: `/api/v1/auth/phone/verify-otp`
- **Body**:
  ```json
  {
    "code": "123456"
  }
  ```

#### Generate Telegram Deep-Link Token
- **Method**: `POST`
- **Path**: `/api/v1/auth/telegram/link`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "token": "e99bdad70d3493d4...",
      "deep_link": "https://t.me/BinarySignalsBot?start=e99bdad70d3493d4...",
      "expires_in_minutes": 30
    }
  }
  ```

---

### 3. Real-Time WebSocket Signals
- **URL**: `ws://localhost:5000/ws/signals`
- Real-time event streams dispatched to trading dashboard clients.

---

## Running the Backend

```bash
cd backend
npm start        # Production start
npm run dev      # Auto-reloading watch mode
```
