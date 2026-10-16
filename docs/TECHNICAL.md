# KYC Onboarding App — Technical Documentation

A full-stack identity-verification application: a **Flutter** mobile app (iOS + Android) and a
**Node.js** backend. This document maps the assignment requirements to the implementation and
explains the complete flow and every technical decision.

See also: [`CONTEXT.md`](../CONTEXT.md) (domain glossary),
[`assumptions.md`](assumptions.md) (requirement → decision → rationale),
[`adr/`](adr/) (architecture decision records), [`ai-workflow.md`](ai-workflow.md).

---

## 1. Requirements → implementation

| # | Requirement | Where it's implemented |
|---|---|---|
| 1 | Authentication: login, session, logout | `kyc_be/features/auth` + `kyc_mobile/features/auth` |
| 2 | Personal details: collect & validate | `kyc_be/features/applications` (Zod) + `kyc_mobile` personal-details step |
| 3 | Document capture with camera | `kyc_mobile` camera + `kyc_be/features/upload` (Cloudinary/local) |
| 4 | Selfie capture | `kyc_mobile` camera + on-device face detection (liveness) |
| 5 | Review & submit | `kyc_mobile` review step + `POST /applications/me/submit` |
| 6 | Verification status + rejection/resubmission | rules engine + admin review + `resubmit` |
| 7 | Resume interrupted flow | server-side draft + encrypted on-device cache |
| — | Production-grade PII/image/token handling | bcrypt, JWT blacklist, private/signed media, encrypted storage |
| — | Resilient to unreliable networks & lifecycle | dio retry/refresh, offline draft, `currentStep` resume |
| — | Tested where it matters | 21 BE tests + mobile unit tests (see §8) |
| — | AI Development Workflow (bonus) | `docs/ai-workflow.md` + this documentation trail |

---

## 2. The complete flow

### 2.1 Applicant journey

```
Register/Login ──► Identity & Details (Doc & Personal) ──► Selfie capture
                                                                   │
        (status + resubmit loop) ◄── Review & submit ◄─────────────┘
```

1. **Authenticate** — register (first user becomes `Admin`; later users become `Applicant`) or log
   in. The client receives a short-lived **access token** + long-lived **refresh token** and stores
   both (and the user's role) in encrypted `flutter_secure_storage`.
2. **Identity & Details (Combined Step 1)** — Select Document Type (National ID, Passport, Driving Licence). Scanning National ID QR code parses CCCD barcode data and auto-fills all Personal & Document fields (Name, DOB, Document Number, Address, Expiry Date, Nationality). Multiple document photo captures are supported with horizontal preview thumbnails. Persists Step 0 (Personal) and Step 1 (Document) to the server draft (`POST /api/applications/me/step`). Full backward navigation (AppBar arrow, Back CTA button, and `PopScope` gesture) allows Applicants to inspect and edit previously entered details at any time.
3. **Selfie capture (Step 2)** — front camera → on-device **face detection** (liveness hint) → image
   uploaded (kind `selfie`) → saved (`step: 2`).
4. **Review & submit (Step 3)** — review the collected data and attached images, then
   `POST /api/applications/me/submit`. The backend runs **verification synchronously** and returns
   a new immutable `Submission` with a result.
5. **Status & resubmission** — the result is `APPROVED`, `REJECTED`, or `NEEDS_REVIEW`. On
   rejection the app shows the reasons and offers **resubmission** (`POST /me/resubmit` pre-fills
   the draft; a new `Submission` version is created on the next submit).

### 2.2 Admin journey

1. Log in with an `Admin` account → routed to the review queue.
2. `GET /api/admin/reviews` lists `NEEDS_REVIEW` submissions.
3. Open a submission → inspect both images (served via the authenticated, signed `/api/media`
   endpoint) and the per-check results.
4. **Approve** or **reject** (`POST /api/admin/reviews/:id`). Rejection requires at least one
   reason, which the applicant sees and can act on.

### 2.3 Resume (interrupted flow)

- **Server is source of truth**: each step is persisted as a `DRAFT` on the `Application`.
- **On-device cache**: the draft is also cached in encrypted storage so a network drop mid-step
  doesn't lose input.
- **On restart**: the app restores the session (token + role) and re-fetches the application,
  resuming at the right step with fields pre-filled.

---

## 3. Architecture

### 3.1 Repository layout (monorepo)

```
kyc-onboarding-app/
├── CONTEXT.md               # domain glossary (shared language)
├── docs/                    # assumptions, ADRs, this doc, AI workflow
├── kyc_be/                  # Node.js + Express + TypeScript + MongoDB
└── kyc_mobile/              # Flutter (iOS + Android)
```

### 3.2 Backend (`kyc_be`) — feature-first + clean architecture

```
src/
├── server.ts                # DB connect → listen → graceful shutdown
├── app.ts                   # Express factory (helmet, cors, rate limit, routes, error handler)
├── core/                    # shared infra (config, middlewares, utils)
│   ├── config/              # env, db, logger, swagger, rateLimiter
│   ├── middlewares/         # requestId, auth, rbac, validate, upload, errorHandler
│   └── utils/               # jwt, storage provider, response formatter, AppError
└── features/
    ├── auth/                # register/login/refresh/logout, User, BlacklistedToken, LoginAttempt
    ├── applications/        # Application + immutable versioned Submissions
    ├── verification/        # rules engine + face match + verification service (VerificationProvider)
    ├── admin/               # review endpoints
    └── upload/              # image upload + authenticated media serving
```

Key patterns: thin controllers → stateless services; Zod at the API boundary; Mongoose at the
persistence boundary; a single `errorHandler` maps every error type to an HTTP status; a single
`responseFormatter` keeps the `{ success, message, data, error }` envelope consistent.

### 3.3 Mobile (`kyc_mobile`) — DDD + Riverpod

```
lib/src/
├── core/                    # config, network (dio), storage, router, theme, failure
└── features/
    ├── auth/                # login / register / logout / session restore
    ├── application/         # KYC journey (personal → document → selfie → review)
    ├── admin/               # review queue
    └── splash/
    (each feature)/
    ├── domain/              # @freezed entities, repository interfaces, usecases
    ├── data/                # datasources (dio) + repository impls
    └── presentation/        # @freezed states, @riverpod adapters, views, widgets
```

- Repositories return `Either<Failure, T>` (dartz); usecases wrap a single operation.
- Adapters are `@riverpod` notifiers; views `watch` and `switch` over sealed `@freezed` states.
- Routing is a `@riverpod` `GoRouter` whose `redirect` watches auth state and routes by role.

---

## 4. Data model

### 4.1 Domain concepts (from `CONTEXT.md`)

**User** (`Admin` | `Applicant`) → **Application** (one active per user, holds status + draft) →
**Submission** (immutable, versioned — one per submit/resubmit).

### 4.2 Backend collections (MongoDB)

| Collection | Key fields | Notes |
|---|---|---|
| `users` | `email` (unique), `password` (bcrypt, `select:false`), `role`, `refreshToken` (SHA-256 hash, `select:false`) | first user = Admin |
| `blacklistedtokens` | `jti` (unique), `expiresAt` | TTL index auto-deletes on expiry |
| `loginattempts` | `emailHash` (unique), `attempts`, `lockedUntil`, `expiresAt` | TTL; account lockout, keyed on email **hash** |
| `applications` | `applicant` (unique ref), `status`, `currentStep`, `draft` (Mixed), `latestSubmission` | one per user |
| `submissions` | `application` + `version` (unique pair), `personalDetails`, `document`, `selfie`, `result`, `checks[]`, `faceMatch`, `adminReview` | immutable snapshots |
| `media` | `publicId` (unique), `owner`, `kind` | object-level authorization for image access |

### 4.3 Statuses

- **Application status**: `DRAFT → SUBMITTED → (APPROVED | REJECTED | NEEDS_REVIEW)`; `NEEDS_REVIEW`
  resolves to `APPROVED | REJECTED` by an admin; `REJECTED` can loop back to `DRAFT` (resubmit).
- **Verification result** (per `Submission`): `APPROVED`, `REJECTED`, `NEEDS_REVIEW`.

### 4.4 Verification pipeline (the `VerificationProvider` boundary)

1. **Rules engine** (deterministic, server-side): document type validity, document expiry, date of
   birth (valid + age ≥ 16), name consistency (personal vs document), DOB consistency, document
   number format, selfie presence.
2. **Face match** (ML, server-authoritative): selfie vs document photo, cosine similarity of face
   embeddings (`@vladmandic/human` + tfjs-node) against a configurable threshold.
3. **Outcome mapping** — never a silent pass/fail:
   - hard rule failure **or** face mismatch → `REJECTED`;
   - ML unavailable, no face detected, **or** liveness not confirmed → `NEEDS_REVIEW`;
   - otherwise → `APPROVED`.

A commercial vendor (Onfido/Jumio/SumSub) would replace the `VerificationProvider` module.

---

## 5. API contract

All responses use `{ success, message?, data?, error? }`. Auth is `Authorization: Bearer <access>`.

| Method | Path | Role | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/register` | — | Register (first user → Admin) |
| `POST` | `/api/auth/login` | — | Login |
| `POST` | `/api/auth/refresh` | — | Rotate refresh token |
| `POST` | `/api/auth/logout` | bearer | Blacklist access token + invalidate refresh |
| `GET` | `/api/applications/me` | Applicant | Application + draft + latest submission |
| `POST` | `/api/applications/me/step` | Applicant | Save a draft step (0/1/2) |
| `POST` | `/api/applications/me/submit` | Applicant | Submit → run verification |
| `POST` | `/api/applications/me/resubmit` | Applicant | Start resubmission after rejection |
| `GET` | `/api/applications/me/submissions` | Applicant | Submission history |
| `GET` | `/api/admin/reviews` | Admin | List `NEEDS_REVIEW` submissions |
| `GET` | `/api/admin/reviews/:id` | Admin | Details + signed media URLs |
| `POST` | `/api/admin/reviews/:id` | Admin | Approve / reject (reasons on reject) |
| `POST` | `/api/upload` | Applicant | Upload document/selfie (multipart) |
| `GET` | `/api/media/:publicId` | bearer | Fetch media (owner or Admin) |
| `GET` | `/api/health` | — | Liveness probe |

Interactive docs: `/api-docs` (Swagger/OpenAPI).

---

## 6. Security

- **Passwords** bcrypt (12 rounds); **refresh tokens** stored as SHA-256 hashes (not raw).
- **JWT dual-token**: short access + rotating refresh, distinct secrets, `jti` blacklist (MongoDB
  TTL) so logout is revocable and refresh-token reuse invalidates the session.
- **Account lockout** keyed on email hash (defeats VPN/IP rotation) and **tiered rate limiting**
  (global / auth / upload / submit) keyed on IP *and* `userId`.
- **Media is private**: Cloudinary `private` assets served only via the authenticated, signed
  `/api/media` endpoint; local fallback is object-level authorized (owner or Admin).
- **Client never trusted**: verification is recomputed server-side; on-device liveness/quality are
  recorded as hints.
- **Enumeration prevention**: generic auth messages; lockout applied uniformly to known/unknown
  emails.
- **Hardening**: helmet, CORS whitelist, body-size limits, PII redaction in logs, non-root Docker
  user, graceful shutdown.
- **Client-side**: tokens + PII draft in `flutter_secure_storage` (Keychain/Keystore).

---

## 7. Observability & tracing

Every request gets an `X-Request-Id` (echo/honor) carried into every log line via
`AsyncLocalStorage`. Logs merge `requestId`, `userId`, `role`, `ip`, `userAgent`, and device
headers (`X-App-Version`, `X-Device-Id`, `X-Device-OS`). Levels: 4xx → `warn`, 5xx → `error`,
success events → `info`. Emails are masked; passwords never logged. `grep <requestId> logs/combined.log`
traces a single failure end-to-end.

---

## 8. Testing

**Backend** (Jest + Supertest + `mongodb-memory-server`): 21 tests — rules-engine unit tests; auth
integration (register/roles/duplicate/login/refresh/logout); full KYC flow integration
(submit → `NEEDS_REVIEW` → admin approve); account-lockout (lock, enumeration privacy, counter
reset); request correlation; rate limiting. The ML face-match is stubbed in tests
(`FACE_MATCH_ENABLED=false`) so they stay fast and deterministic.

**Mobile** (flutter test): API-error mapping unit tests. (Adapter/repository tests with mocked
`dio` and widget tests are the noted next step — see §10.)

---

## 9. Running & deployment

### Backend (local / Docker / Railway)
```bash
cd kyc_be
docker compose up --build        # MongoDB + API (local storage fallback, no keys needed)
# or: cp .env.example .env && npm install && npm run dev
```
Production (Railway): multi-stage Dockerfile (non-root, `/api/health` healthcheck) +
`railway.toml`. Set `MONGODB_URI`, `JWT_SECRET`/`JWT_REFRESH_SECRET`, and `CLOUDINARY_*` (the app
auto-switches from local to Cloudinary when the three keys are present). `PORT` is injected by
Railway; the app binds `0.0.0.0`.

### Mobile
```bash
cd kyc_mobile
flutter pub get && dart run build_runner build
flutter run --dart-define=API_BASE_URL=http://localhost:5001   # (Android emu: 10.0.2.2:5001)
```
Camera/ML Kit require a real device or simulator.

---

## 10. Decisions & trade-offs

The full, traceable list is in [`docs/assumptions.md`](assumptions.md); the hard-to-reverse ones
are in [`docs/adr/`](adr/). Highlights:

- **Verification model**: internal rules engine + admin review behind a `VerificationProvider`
  (no external KYC keys; vendor-swappable).
- **Data model**: `Application` + immutable versioned `Submission`s for a full audit trail.
- **Face match split**: on-device liveness (capture-time) + server-authoritative match.
- **Storage**: Cloudinary private/signed with a local fallback (runs keyless today).
- **Persistence**: MongoDB + Mongoose (document store suits variable per-document-type fields).

**What I'd do with more time** (also in the READMEs):
- Async verification queue + webhooks (the seam exists).
- Multi-frame blink liveness (currently a single-frame face-presence check).
- Full MRZ parsing for document OCR auto-fill.
- Mobile adapter/repository unit tests + widget/golden tests.
- `rate-limit-redis` shared store for horizontal scaling; dependency prune of transitive test deps.
- Email verification / password reset.
