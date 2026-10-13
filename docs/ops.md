# Operations & Bot Defence Guide

This document outlines bot defence, firewall rules, monitoring, duplicate prevention semantics, and operational procedures for Rate My Gov.

---

## 1. Vercel / Edge Firewall Configuration

Configure the following rules in the **Security > Firewall** dashboard on Vercel.

### Rule 1: Vote Endpoint Rate Limiting
Prevents high-frequency automated abuse and scripted flooding against vote recording.

- **Name**: `Rate limit POST /api/vote`
- **Path**: `/api/vote`
- **Method**: `POST`
- **Rate Limit**:
  - **Window**: Fixed window (`60 seconds` / `1 minute`)
  - **Max Requests**: `10` requests per IP
  - **Key**: IP address (`Client IP`)
- **Action**: `Deny` (Status: `429 Too Many Requests`)

### Rule 2: Scripted and Empty User-Agent Blocking
Blocks automated tools, headless scrapers, and generic HTTP clients that target the vote processing endpoint.

- **Name**: `Block empty or scripted User-Agents on /api/vote`
- **Path**: `/api/vote`
- **Method**: `POST`
- **Condition**:
  - `User-Agent` is empty or missing OR
  - `User-Agent` matches regex / contains:
    - `curl`
    - `wget`
    - `python-requests`
    - `python-urllib`
    - `aiohttp`
    - `httpx`
    - `Go-http-client`
    - `node-fetch`
    - `axios`
    - `PostmanRuntime`
    - `Scrapy`
- **Action**: `Deny` (Status: `403 Forbidden`)

### Rule 3: Emergency Attack Challenge Mode
If a coordinated DDoS attack, botnet flood, or credential/token-stuffing campaign occurs:

1. Navigate to **Project Settings > Security > Attack Mode** in the Vercel dashboard.
2. Toggle **Attack Challenge Mode** to **ON** (or in Firewall Custom Rules, create an override rule setting the Action to `Managed Challenge` or `Interactive Challenge` for all incoming traffic to `/api/vote`).
3. This forces every request through an edge cryptographic challenge before reaching the server runtime.
4. Once traffic normalizes, toggle **Attack Challenge Mode** back to **OFF** to restore seamless Post/Redirect/Get flow.

---

## 2. In-App Bot Defence Architecture

1. **Lazy-Loaded Cloudflare Turnstile**:
   - Turnstile scripts (`challenges.cloudflare.com`) are **never** loaded on initial page load or public browsing routes.
   - The script is loaded exclusively on the state voting page upon the **first interaction** (`focusin` or `pointerdown`) inside the vote form.
   - The Turnstile verification token is verified server-side on POST `/api/vote`. If verification fails, the request is rejected with `400 Bad Request`.
2. **Hidden Honeypot Field (`website`)**:
   - A hidden input named `website` is placed within the vote form (`style="display:none;" aria-hidden="true"`).
   - If a bot autofills this field, the `/api/vote` endpoint **silently returns a fake success response** (`200 OK` for JSON requests or `303 See Other` redirect to `/state/<slug>?voted=1` for HTML form submissions).
   - No database write is executed, and no duplicate error is surfaced to the bot.
3. **Origin & Content-Type Enforcements**:
   - `POST /api/vote` verifies the incoming `Origin` header matches the site origin (`url.origin`), returning `403 Forbidden` on mismatch.

---

## 3. Sanity Monitoring Endpoint (`/api/health`)

A per-state sanity monitoring endpoint is available at `GET /api/health` to detect anomalous spikes or coordinated surges across all 36 states and UTs.

- **Authentication**: Protected by the `CRON_SECRET` header (`cron_secret`, `x-cron-secret`, or `Authorization: Bearer <CRON_SECRET>`). Unauthenticated requests receive `401 Unauthorized`.
- **Telemetry Returned**:
  - `status: "ok"`
  - `timestamp`: Current ISO timestamp (UTC)
  - `windowMinutes`: 5
  - `totalVotesLast5Min`: Aggregate count of votes recorded across India in the last 5 minutes.
  - `states`: Array of all 36 states/UTs with their respective `votesLast5Min` counts.
- **Alerting Threshold**:
  - If any single state experiences sudden surges orders of magnitude higher than baseline (e.g. > 500 votes in 5 minutes without corresponding traffic referral events), inspect client IP distribution and consider tightening rate limits or enabling Attack Challenge Mode.

---

## 4. Duplicate Prevention Policy & Network Side Effects

### Current Strict Policy (Product Decision)
By product requirement, duplicate prevention enforces **both** of the following constraints atomically in PostgreSQL:
1. `(state_code, voter_hash)` — Enforces at most one vote per state per device (HMAC-SHA256 hashed device cookie).
2. `(state_code, ip_hash)` — Enforces at most one vote per state per IP network identity (HMAC-SHA256 hashed client IP, with IPv6 normalized to `/64`).

### Side Effects on Indian Internet Infrastructure
Because the unique constraint on `(state_code, ip_hash)` is strictly enforced at the database level:
- **Carrier-Grade NAT (CGNAT) on Indian Mobile Networks**:
  Major Indian mobile operators (such as Reliance Jio and Bharti Airtel) frequently route thousands of mobile subscribers through shared CGNAT public IPv4 gateways. When one user on a cellular tower/NAT pool votes on a state, subsequent users sharing that same public IPv4 address will receive a duplicate notification (`voted=dup`).
- **Shared Wi-Fi and Households**:
  Multiple family members or colleagues sharing a home or office broadband connection (with a single public WAN IP) cannot cast independent votes for the same state.
- **Institutions and Universities**:
  Entire campuses sharing egress proxies will share the same `ip_hash`.

### Procedure to Loosen the Constraint
If field feedback or operational metrics require loosening the duplicate policy so multiple people on the same shared Wi-Fi or CGNAT gateway can vote:

1. **Execute Database Migration**:
   Drop the unique constraint on `(state_code, ip_hash)`:
   ```sql
   ALTER TABLE votes DROP CONSTRAINT IF EXISTS uq_votes_state_ip;
   ```
2. **Retain the Device Constraint**:
   The primary key `(state_code, voter_hash)` remains active, ensuring each unique browser/device cannot vote more than once per state.
3. **Rely on Rate Limits**:
   The Vercel Edge Firewall rule (`10 requests per minute per IP`) and Turnstile anti-bot checks continue to prevent automated ballot-box stuffing while permitting legitimate human users behind CGNAT or shared Wi-Fi to submit feedback.
