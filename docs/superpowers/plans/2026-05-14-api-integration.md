# Yak-Map API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Yak-Map features call real external services when keys are configured while staying fully testable with local fallback data.

**Architecture:** Add a zero-dependency Node proxy server that serves the existing PWA and owns secret-bearing API calls. Keep the frontend API surface small: `/api/config`, `/api/medicine/search`, `/api/ocr`, `/api/pharmacies`, `/api/hospitals`, `/api/fcm/register`, and `/api/auth/*`.

**Tech Stack:** Node 24 built-ins, browser JavaScript, public REST APIs, Supabase Auth/PostgREST via REST, OpenRouter OCR REST, Kakao Maps JavaScript SDK.

---

### Task 1: Server API Foundation

**Files:**
- Create: `lib/sample-data.mjs`
- Create: `lib/env.mjs`
- Create: `lib/api-providers.mjs`
- Create: `server.js`
- Modify: `package.json`
- Test: `tests/api-contract.test.mjs`

- [ ] Write a failing test that imports provider helpers and asserts fallback medicine/pharmacy/hospital/OCR/auth behavior.
- [ ] Run `node tests/api-contract.test.mjs` and confirm it fails because modules do not exist.
- [ ] Implement environment loading, fallback data, external API URL builders, response normalizers, and HTTP route handlers.
- [ ] Run `node tests/api-contract.test.mjs` and `npm test`.

### Task 2: Frontend Integration

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `sw.js`
- Test: `tests/validate-app.mjs`

- [ ] Extend validation to require backend API calls, OCR file input, API status display, and Kakao SDK loading hook.
- [ ] Run `npm test` and confirm the new assertions fail.
- [ ] Wire the existing UI to the backend endpoints with clear loading/error states and local fallback messaging.
- [ ] Run `npm test` and syntax checks.

### Task 3: Documentation and Runtime Check

**Files:**
- Add: `.env.example`
- Modify: `README.md`
- Modify: `docs/api-integration.md`

- [ ] Document required keys and which features degrade without keys.
- [ ] Start `npm start` and confirm `GET /`, `GET /api/config`, `GET /api/medicine/search?q=타이레놀` return HTTP 200.
