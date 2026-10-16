# Manual QA Test Scenarios

Hands-on test plan for the KYC Onboarding app — **Flutter (kyc_mobile)** and **backend (kyc_be)**.
Runs against a locally-deployed stack; no automated tooling required.

---

## 1. Environment setup

1. **Start the backend** (see `kyc_be/README.md`):
   ```bash
   cd kyc_be
   docker compose up --build      # MongoDB + API on :5000
   ```
   - Swagger UI: http://localhost:5000/api-docs
   - Health: `GET http://localhost:5000/api/health` → `{ success: true }`
2. **Start the mobile app** (see `kyc_mobile/README.md`):
   ```bash
   cd kyc_mobile
   flutter pub get && dart run build_runner build
   flutter run --dart-define=API_BASE_URL=http://localhost:5000   # Android emu → http://10.0.2.2:5000
   ```
3. **Camera/ML note**: document & selfie capture + OCR + face detection require a real device or
   simulator. The emulator camera uses the host webcam.

### Test accounts (create in this order)

| Account | How | Role |
|---|---|---|
| `admin@test.com` / `password123` | first registration | Admin |
| `applicant@test.com` / `password123` | second registration | Applicant |

> The **first** user in a fresh DB becomes Admin; all later ones are Applicants. Reset by
> `docker compose down -v` (wipes Mongo) then `up`.

### Controlling the verification outcome (important)

| Desired result | How to trigger |
|---|---|
| `REJECTED` | submit with an **expired** document, a **name/DOB mismatch** between personal details and document, or a **future/under-16 DOB** |
| `NEEDS_REVIEW` | set `FACE_MATCH_ENABLED=false` in `dev.env`, restart the API, then submit a valid draft |
| `APPROVED` | face match enabled, document + selfie of the **same person**, liveness `passed`, all rules valid |

---

## 2. Backend (API) scenarios

Test via Swagger or `curl`. All responses use `{ success, message, data, error }`.
Auth header: `Authorization: Bearer <access_token>`.

### AUTH

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| AUTH-01 | Register first user = Admin | `POST /api/auth/register` `{email, password}` on a fresh DB | `201`, `data.user.role == "Admin"`, `token` + `refreshToken` returned |
| AUTH-02 | Register second user = Applicant | register a different email | `201`, `role == "Applicant"` |
| AUTH-03 | Duplicate email | register an existing email | `409` "Email is already in use" |
| AUTH-04 | Weak password | register with password `< 8` chars | `400` validation |
| AUTH-05 | Login success | `POST /api/auth/login` valid creds | `200` with tokens |
| AUTH-06 | Login wrong password | wrong password | `401` "Invalid email or password" (no enumeration) |
| AUTH-07 | Login unknown email | non-existent email | `401`, same generic message as AUTH-06 |
| AUTH-08 | Refresh | `POST /api/auth/refresh` with `refreshToken` | `200`, new `token` + `refreshToken` |
| AUTH-09 | Refresh reuse | refresh with an already-rotated token | `401` (session invalidated) |
| AUTH-10 | Logout | `POST /api/auth/logout` (bearer) | `200`; subsequent request with that access token → `401` |
| AUTH-11 | Account lockout | 5 failed logins, then correct password | 6th → `429` "Too many failed attempts" (15 min) |
| AUTH-12 | Lockout hides existence | 5 failed logins on an *unknown* email | 6th → `429` (identical to AUTH-11 — no enumeration) |

### APPLICATION (KYC flow — Applicant token)

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| APP-01 | Get my application (empty) | `GET /api/applications/me` | `200`, `application.status == "DRAFT"`, `draft == {}`, `latestSubmission == null` |
| APP-02 | Save personal details | `POST /api/applications/me/step` `{step: 0, data: {fullName, dateOfBirth:"YYYY-MM-DD", nationality}}` | `200`, `draft.personalDetails` populated |
| APP-03 | Save invalid step | `step: 9` or missing fields | `400` |
| APP-04 | Save document | `step: 1` with `type`, `documentNumber`, `fullName`, `dateOfBirth`, `expiryDate`, `imagePublicId` | `200`, `draft.document` populated |
| APP-05 | Save selfie | `step: 2` with `imagePublicId`, `liveness:{passed, method}` | `200`, `draft.selfie` populated |
| APP-06 | Submit incomplete | submit before all 3 steps | `400` validation |
| APP-07 | Submit valid → result | `POST /api/applications/me/submit` | `200`, `submission.version == 1`, `submission.result` set, `application.status == result` |
| APP-08 | Re-submit without rejection | submit again (already non-DRAFT) | `400` "already submitted" |
| APP-09 | Resubmit from REJECTED | `POST /api/applications/me/resubmit` after a rejection | `200`, status back to `DRAFT`, draft pre-filled (textual fields, no images) |
| APP-10 | Resubmit from non-REJECTED | resubmit while `DRAFT`/`APPROVED` | `400` |
| APP-11 | Submission history | `GET /api/applications/me/submissions` | `200`, array ordered by `version` desc, immutable across resubmits |

### VERIFICATION OUTCOMES

| ID | Scenario | Data | Expected `result` |
|---|---|---|---|
| VER-01 | Expired document | `expiryDate` in the past | `REJECTED`, `checks.documentExpiry.passed == false` |
| VER-02 | Name mismatch | personal fullName ≠ document fullName | `REJECTED`, `nameConsistency` failed |
| VER-03 | DOB mismatch | personal DOB ≠ document DOB | `REJECTED`, `dobConsistency` failed |
| VER-04 | Underage | DOB < 16 years ago | `REJECTED`, `dateOfBirth` failed |
| VER-05 | Bad document number | e.g. `"ab"` | `REJECTED`, `documentNumber` failed |
| VER-06 | ML unavailable | `FACE_MATCH_ENABLED=false` | `NEEDS_REVIEW`, `faceMatch.modelLoaded == false` |
| VER-07 | Liveness not confirmed | submit selfie without `liveness.passed` | `NEEDS_REVIEW` |
| VER-08 | Matching person | same face, all rules valid | `APPROVED`, `faceMatch.matched == true` |

### ADMIN (Admin token)

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| ADM-01 | List pending | `GET /api/admin/reviews` | `200`, only `NEEDS_REVIEW` submissions |
| ADM-02 | Detail | `GET /api/admin/reviews/:id` | `200`, `submission` + `media.documentUrl`/`selfieUrl` |
| ADM-03 | Approve | `POST /api/admin/reviews/:id` `{decision:"approve"}` | `200`, `result == "APPROVED"`; applicant sees `APPROVED` |
| ADM-04 | Reject with reason | `{decision:"reject", reasons:["..."]}` | `200`, `result == "REJECTED"`, `adminReview.reasons` set |
| ADM-05 | Reject without reason | `{decision:"reject"}` | `400` "requires at least one reason" |
| ADM-06 | Review non-pending | review an `APPROVED` submission | `400` "not pending review" |
| ADM-07 | Applicant hits admin route | `GET /api/admin/reviews` with Applicant token | `403` |

### UPLOAD & MEDIA

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| UP-01 | Upload image | `POST /api/upload` (multipart `image` + `kind`) | `201`, `publicId` returned |
| UP-02 | Upload non-image | attach a `.txt` | `400` "Only image files" |
| UP-03 | Upload > 10MB | large file | `400` |
| UP-04 | Fetch own media | `GET /api/media/:publicId` (owner) | `200` image (or redirect to signed URL) |
| UP-05 | Fetch others' media | different user's `publicId` | `403` |
| UP-06 | Admin fetches any media | Admin token | `200` |
| UP-07 | Fetch without token | no bearer | `401` |

### SECURITY / ABUSE

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| SEC-01 | No token | any protected endpoint without bearer | `401` |
| SEC-02 | Expired/invalid token | garbage bearer | `401` |
| SEC-03 | Rate limit (auth) | >10 failed logins in 15 min | `429`, `Retry-After` header present |
| SEC-04 | Rate limit (submit) | >5 submits in 15 min | `429` |
| SEC-05 | Request correlation | any request | `X-Request-Id` response header present; `requestId` in error bodies |

---

## 3. Mobile (Flutter) scenarios

### 3.1 Authentication

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| M-AUTH-01 | Launch → splash → login | cold start | splash spinner, then login screen (no session) |
| M-AUTH-02 | Register | "Create account" → fill form | routed to role-appropriate home |
| M-AUTH-03 | Login | valid creds | routed to home (Applicant) or queue (Admin) |
| M-AUTH-04 | Invalid login | wrong password | inline error, no crash |
| M-AUTH-05 | Logout | tap logout | back to login; token cleared |
| M-AUTH-06 | Session restore | kill app, relaunch while logged in | resumes authenticated (no re-login) |
| M-AUTH-07 | Role routing | Admin login vs Applicant login | Admin → `/admin`, Applicant → `/home` |
| M-AUTH-08 | Locked out | 5 wrong passwords | "Too many failed attempts" shown |

### 3.2 KYC flow (Applicant)

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| M-KYC-01 | Start 3-Step Flow | "Continue verification" from DRAFT | Step 1 of 3 (Identity & Details) |
| M-KYC-02 | Document Type Selection | Select Document Type dropdown | National ID enables QR scanning; Passport/Driving Licence disables QR scan with tip note |
| M-KYC-03 | QR Code Auto-Fill | Tap "Scan QR Code" on National ID | Parses CCCD QR barcode; auto-fills Document Number, Full Name, DOB, Address, Expiry, Nationality into form fields |
| M-KYC-04 | Multiple Document Photos | Tap "Capture Photo" multiple times | Horizontal thumbnail carousel displays previews with `#1`, `#2` badges, delete (`X`) buttons, and `+ Add Photo` card |
| M-KYC-05 | Delete Document Photo | Tap `X` on a thumbnail | Selected photo removed from list and Draft submission payload |
| M-KYC-06 | Identity & Details Save | Valid form inputs + photo → Continue | Saves Step 0 (Personal Details) and Step 1 (Document) to server Draft; advances to Step 2 (Selfie) |
| M-KYC-07 | Backward Navigation (AppBar) | Tap AppBar back arrow (`<`) on Step 2 or 3 | Navigates to previous step; pre-fills all previously entered fields and thumbnails from Draft for inspection |
| M-KYC-08 | Backward Navigation (Button CTA) | Tap "Back" CTA button on Step 2 or 3 | Navigates to previous step with all Draft fields intact |
| M-KYC-09 | Hardware Back Gesture | Perform swipe/hardware back gesture on Step 2 or 3 | Decrements active step (`PopScope` handler) |
| M-KYC-10 | Selfie capture | Front camera, capture | Preview + "Face detected ✓" / "not detected" |
| M-KYC-11 | Review & Submit | Review summary on Step 3 → "Submit Application" | Button shows loading indicator; validates draft completeness; submits application to backend and routes to home |
| M-KYC-12 | Resume (mid-flow) | Start, save Step 1, kill app, relaunch | Resumes at Step 2 (Selfie) with pre-filled Draft fields |

### 3.3 Status & resubmission

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| M-STA-01 | Approved | submit an APPROVED application | home shows "Identity verified ✓" |
| M-STA-02 | Under review | `NEEDS_REVIEW` | home shows "Under review" |
| M-STA-03 | Rejected | `REJECTED` | home shows rejection reasons + "Edit & resubmit" |
| M-STA-04 | Resubmit | tap "Edit & resubmit" | back to DRAFT, fields pre-filled, images cleared |
| M-STA-05 | Resubmit → new version | re-capture, submit | `version` increments; history preserved |

### 3.4 Admin review (mobile)

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| M-ADM-01 | Queue empty | Admin login, no pending | "No pending reviews" |
| M-ADM-02 | Queue list | pending submissions exist | cards show name + doc type + version |
| M-ADM-03 | Detail | tap a card | both images + per-check pass/fail list |
| M-ADM-04 | Approve | Approve button | returns to queue, item gone |
| M-ADM-05 | Reject | Reject → enter reason | returns to queue, applicant sees reason |

### 3.5 Resilience

| ID | Scenario | Steps | Expected |
|---|---|---|---|
| M-RES-01 | Network off at login | airplane mode → login | graceful "Network error" message, no crash |
| M-RES-02 | Network off mid-flow | drop network after step 0 | no crash; state retained |
| M-RES-03 | Backgrounded mid-capture | camera open → background → foreground | camera recovers or re-initializes |
| M-RES-04 | 401 auto-refresh | expire access token, keep app open, act | transparent refresh, request succeeds |

---

## 4. Cross-cutting & edge cases

| ID | Scenario | Expected |
|---|---|---|
| X-01 | PII in logs | emails masked (`j***@…`), passwords never logged |
| X-02 | Token in storage | tokens/draft in encrypted secure storage (not plain preferences) |
| X-03 | Media privacy | media URLs are signed/short-lived; not publicly accessible |
| X-04 | Concurrent resubmit | two devices submit simultaneously → each gets a distinct `version` (no lost update) |
| X-05 | Long inputs | name > 200 chars, phone > 20 → validation error |
| X-06 | Special characters | document number with symbols → `REJECTED` (format) |

---

## 5. Defect report template

```
Title:       [component] short summary
Environment: iOS/Android device, app version, backend commit
Severity:    Blocker / Major / Minor / Trivial
Precondition:
Steps:       1. …  2. …  3. …
Actual:      what happened (attach screenshot + X-Request-Id if from API)
Expected:    what should have happened
Notes:       logs / reproduction rate
```

**Helpful for triage**: every API response carries an `X-Request-Id` header and error bodies include
`requestId` — include it so the failure can be grepped in `kyc_be/logs/combined.log`.
