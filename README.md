# kyc_be — KYC Onboarding Backend

Node.js + Express + TypeScript + MongoDB REST API for the KYC onboarding flow.
See [`CONTEXT.md`](CONTEXT.md) for the shared domain model and
[`docs/assumptions.md`](docs/assumptions.md) for every decision and its rationale.

## Stack

- **Runtime/framework:** Node.js 20, Express 4, TypeScript 5
- **Database:** MongoDB 7 + Mongoose 8
- **Auth:** JWT dual-token (short access + rotating refresh), bcrypt, token blacklist
- **Validation:** Zod at the API boundary
- **Storage:** Cloudinary (private, signed URLs) with a local-disk fallback
- **Face match:** `@vladmandic/human` (Node+WASM build) + `@tensorflow/tfjs` (server-authoritative)
- **Docs:** Swagger/OpenAPI (`/api-docs`)

## Run locally

### Option A — Docker Compose (recommended, zero local deps)

```bash
cp dev.env.example dev.env    # create the gitignored env file
docker compose up --build
```

- API: http://localhost:5001/api/health
- Swagger: http://localhost:5001/api-docs
- MongoDB is started for you. Images use the **local** storage fallback by default; to use
  **Cloudinary**, add your `CLOUDINARY_*` keys to `dev.env` and set `STORAGE_DRIVER=cloudinary`.
  (`dev.env` is gitignored — never commit real keys.)

> **Port note:** the API is published on host port **5001** (→ container 5000). macOS
> **ControlCenter (AirPlay Receiver)** reserves port `5000`, so the host mapping uses 5001. If you
> run bare Node (Option B), `PORT=5000` is likewise blocked — set `PORT=5001` in `.env`, or turn
> off AirPlay Receiver (System Settings → General → AirDrop & Handoff).

### Option B — Bare Node (dev)

```bash
cp .env.example .env          # set PORT=5001 and adjust MONGODB_URI if needed
npm install
npm run dev                   # nodemon + ts-node, hot reload
```

Requires a local MongoDB on `localhost:27017` (or point `MONGODB_URI` elsewhere).

## Deploy to Railway (production)

1. **Add a MongoDB.** In Railway, add the MongoDB plugin (or connect Atlas) and copy its
   connection URI.
2. **Set env vars** in the Railway service (or `railway up`):
   - `MONGODB_URI` (Railway/Atlas URI)
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` (strong random values)
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`
   - `CORS_ORIGIN` (comma-separated allowed origins)
   - `NODE_ENV=production`
   - `PORT` is injected automatically by Railway.
3. The `Dockerfile` (multi-stage, non-root, `/api/health` healthcheck) and `railway.toml`
   (healthcheck path + restart policy) are already configured. Railway detects the Dockerfile
   and builds it.

**Storage switch:** when all three `CLOUDINARY_*` vars are present the app automatically serves
media from Cloudinary (private, signed URLs); otherwise it falls back to local disk.

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development` / `test` / `production` |
| `PORT` | `5000` | HTTP port (Railway injects this) |
| `MONGODB_URI` | `mongodb://localhost:27017/kyc` | Connection string |
| `MONGO_DB_NAME` | `kyc` | DB name |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | dev fallbacks | Access / refresh signing secrets |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | `15m` / `30d` | Token lifetimes |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `STORAGE_DRIVER` | auto | `cloudinary` / `local` / unset=auto |
| `LOCAL_UPLOAD_DIR` | `uploads` | Local fallback directory |
| `CLOUDINARY_*` | — | Cloudinary credentials + folder |
| `FACE_MATCH_ENABLED` | `true` | Toggle the ML face match |
| `FACE_MATCH_THRESHOLD` | `0.5` | Cosine-similarity threshold |

## Architecture

Feature-first + clean architecture (see `SKILL_BE.md`):

```
src/
├── server.ts                 # entry: DB connect → listen → graceful shutdown
├── app.ts                    # Express factory (Supertest-friendly)
├── core/                     # shared infra (config, middlewares, utils)
│   ├── config/               # env, db, logger, swagger
│   ├── middlewares/          # auth, rbac, validation, upload, error handler
│   └── utils/                # jwt, storage provider, response formatter, AppError
├── features/
│   ├── auth/                 # register/login/refresh/logout, User, BlacklistedToken
│   ├── applications/         # Application + immutable versioned Submissions
│   ├── verification/         # rules engine + face match + verification service
│   ├── admin/                # admin review endpoints
│   └── upload/               # image upload + authenticated media serving
└── __tests__/                # mirrors src/
```

### Domain model

- **User** (role `Admin` | `Applicant`) → **Application** (one active per user) → **Submission**
  (immutable, versioned; each submit/resubmit = new version).
- Status flow: `DRAFT → [submit] → APPROVED | REJECTED | NEEDS_REVIEW → [admin] → APPROVED |
  REJECTED → [resubmit] → DRAFT`.

### Verification pipeline (the `VerificationProvider` boundary)

1. **Rules engine** (deterministic): document type/expiry, age, name & DOB consistency vs.
   personal details, document-number format, selfie presence.
2. **Face match** (ML, server-authoritative): selfie vs. document photo, cosine similarity.
3. Outcome mapping: hard rule failure or face mismatch → `REJECTED`; ML unavailable, no face, or
   unconfirmed liveness → `NEEDS_REVIEW`; otherwise `APPROVED`. **Never** a silent pass/fail.

### API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register (first user = Admin) |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/refresh` | — | Rotate refresh token |
| POST | `/api/auth/logout` | bearer | Logout (blacklist + invalidate) |
| GET | `/api/applications/me` | Applicant | My application + draft + latest submission |
| POST | `/api/applications/me/step` | Applicant | Save a draft step |
| POST | `/api/applications/me/submit` | Applicant | Submit for verification |
| POST | `/api/applications/me/resubmit` | Applicant | Start resubmission after rejection |
| GET | `/api/applications/me/submissions` | Applicant | Submission history |
| GET | `/api/admin/reviews` | Admin | List pending reviews |
| GET | `/api/admin/reviews/:id` | Admin | Review details + signed media URLs |
| POST | `/api/admin/reviews/:id` | Admin | Approve / reject |
| POST | `/api/upload` | Applicant | Upload document/selfie image |
| GET | `/api/media/:publicId` | bearer | Fetch media (owner or Admin) |

## Security considerations

- **Passwords** hashed with bcrypt (12 rounds); refresh tokens stored as SHA-256 hashes.
- **Tokens**: short access + rotating refresh, distinct secrets, `jti` blacklist (MongoDB TTL index)
  so logout is revocable and reuse of a stolen refresh token invalidates the session.
- **Media**: Cloudinary assets are **private**; served only through the authenticated
  `/api/media` endpoint as short-lived signed URLs. Local fallback is object-level authorized
  (owner or Admin only) and never public.
- **Input**: Zod validation + coercion at the boundary; no raw queries (Mongoose).
- **Hardening**: helmet, CORS whitelist, tiered rate limiting (below), body-size limits, PII
  redaction in logs, generic auth error messages (no user enumeration), non-root Docker user,
  graceful shutdown.
- **Credential stuffing**: per-account lockout (keyed on an *email hash*, not IP) after
  `LOGIN_MAX_ATTEMPTS` (5) failures, locked for `LOGIN_LOCK_MS` (15 min). Applied uniformly to
  existing *and* unknown emails, so it defeats VPN/IP rotation and still never reveals account
  existence.
- **Client never trusted**: verification is recomputed server-side; on-device liveness is a hint.

### Rate limiting & anti-abuse

Tiered `express-rate-limit` middleware (see `core/config/rateLimiter.ts`), keyed and shaped per
endpoint:

| Tier | Scope | Key | Limit |
|---|---|---|---|
| Global | `/api` | IP | 120 / min |
| Auth | `/api/auth` (login/register/refresh) | IP | 10 / 15 min, *failures only* |
| Upload | image upload | user (or IP) | 10 / min |
| Submit | `/submit` (runs ML) | user (or IP) | 5 / 15 min |

- **Keyed on `userId` for authenticated endpoints** — limits follow the account (an attacker
  can't bypass by rotating IPs) and shared mobile NATs don't throttle innocent users.
- **`skipSuccessfulRequests` on auth** — only failed login/register attempts consume quota, so
  brute-force is slowed without penalizing legitimate users.
- **429 responses** use the standard API shape and carry `requestId`, `Retry-After`, and the
  `RateLimit-*` headers.
- The store is **in-memory** (per-process). For horizontal scaling on Railway, swap in a shared
  store via `rate-limit-redis` (add `REDIS_URL`); `createLimiter` is the single seam for that.

A further layer (not yet implemented) would be per-account lockout after N failed logins, tracked
on the User record rather than by IP.

## Trade-offs & what I'd do with more time

- **Face match is synchronous** on submit (fine for one image pair). A real vendor uses async
  callbacks + webhooks; the `VerificationProvider` interface is the seam for that swap.
- **Liveness is on-device only** (blink challenge); the backend records but does not re-verify it
  from video frames. A liveness vendor would close this gap.
- **No email verification / password reset** (out of scope for v1).
- **Media ownership** is enforced via a `Media` record; a more scalable design would move signed
  URL issuance into the storage layer with per-object keys.
- **Image-quality checks** are basic (presence/size); deeper blur/glare detection would need more
  vision work.
- **`npm audit`** flags transitive dev/test dependencies (primarily `mongodb-memory-server`,
  tfjs tooling). Worth a dependency-prune pass before production hardening.

## Logging & tracing

Every request gets a correlation ID (`X-Request-Id`, echo-able and honored if the client sends one)
that appears in every log line and in error responses, so a single failure can be traced across
morgan request logs, business events, and the error handler:

```
# search all logs for one request
grep "a1b2c3d4" logs/combined.log
```

- **Levels**: client errors (4xx — validation, bad login) → `warn`; server errors (5xx) → `error`;
  success events (registered / logged in / logged out) → `info`.
- **Context**: the `log()` helper in `core/config/logger.ts` merges `requestId`, `userId`, and
  `role` (via `AsyncLocalStorage`) into every line automatically — no parameter threading.
- **Client/device context**: `ip`, `user-agent`, and client-sent headers `X-App-Version`,
  `X-Device-Id`, `X-Device-OS` are captured into the context and every log line, so an issue can be
  traced to a specific device/build. The mobile app must send these headers; they are treated as
  *untrusted hints* (recorded for diagnostics/fraud signals, never used for authorization). `ip`
  is resolved from `X-Forwarded-For` via `trust proxy` (set to `TRUST_PROXY`, default `1` for
  Railway).
- **Privacy**: IP addresses and device identifiers are personal data. They are logged for
  diagnostics with a short retention window; for production you may want to hash IPs or redact the
  device headers to meet your data-minimization policy.
- **No PII**: passwords are never logged and emails are masked (`j***@example.com`).

So "register failed before reaching the DB" (a Zod 400) and "login failed" (a 401) are both logged
as `warn` with a `requestId` you can hand to the user or grep for.

## Testing

```bash
npm test                 # Jest + Supertest + mongodb-memory-server (in-memory DB)
npm run test:coverage
```

- Unit: rules engine (deterministic checks).
- Integration: full auth flow and the full KYC flow (submit → `NEEDS_REVIEW` → admin approve).
- The ML face-match is stubbed/disabled in tests (`FACE_MATCH_ENABLED=false`) to keep them fast
  and deterministic; the degradation path (→ `NEEDS_REVIEW`) is what the tests exercise.
