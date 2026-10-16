# Assumptions & Decisions Log

The assignment states: *"Where requirements are unclear, make an assumption and document it."*
Every ambiguous requirement below is mapped to the assumption we made, why, and what would change
it. This is the primary artifact for defending decisions in the follow-up interview.

## Requirement ambiguities → decisions

| # | Ambiguous requirement (from `Senior_Fullstack_Assignment.pdf`) | Assumption / decision | Rationale | Would change if… |
|---|---|---|---|---|
| 1 | "identity verification flow" — no vendor specified | **Internal rules engine + admin review**, exposed behind a `VerificationProvider` interface | No external KYC API keys needed to run/demo; still real server logic, not a mocked API; the interface makes Onfido/Jumio/SumSub a drop-in later | a specific vendor is mandated |
| 2 | "capture an ID document … with the camera" — how are the document's fields obtained? | **On-device OCR** (ML Kit text recognition + MRZ for passports) with **manual fallback**; no server-side OCR | Reliable across document types, no heavy server OCR dependency; auto-fill is a UX win but never trusted without user confirmation | OCR accuracy is explicitly required |
| 3 | "Selfie capture" — is liveness/face-match required? | **On-device active liveness** (blink challenge) + **server-authoritative face match** (cosine similarity) | Liveness is inherently about the capture moment (on-device); the client is never trusted for identity, so the match is recomputed server-side; inconclusive → `NEEDS_REVIEW` | a liveness/face-match vendor is required |
| 4 | "Resume: an interrupted flow can be continued later" — persistence boundary | **Server-side DRAFT + encrypted on-device cache**; server is source of truth, device cache is for offline resilience | Survives app kill, network drop, and reinstall; cross-device resume | offline-first is a hard requirement |
| 5 | "Authentication: login, session handling, logout" — no registration, roles, or OAuth | **Email/password self-registration + JWT dual-token** (short access + rotating refresh) + logout blacklist; **RBAC** roles `Admin` / `Applicant`; first registered user is `Admin` | Standard, self-contained, matches the backend skill; blacklist makes logout revocable; first-user-Admin removes the need for seed scripts | SSO/OAuth or a mandated identity provider |
| 6 | "Production-grade handling of sensitive data (PII, images, tokens)" — no compliance regime named | bcrypt (12 rounds), JWT blacklist + rotation, images stored **private** and served only via **authenticated, short-lived signed URLs**, PII redaction in logs, delete/forget flow | GDPR-ready posture without claiming certification | a specific regime (GDPR/ISO 27001/PCI) is named |
| 7 | "Backend is required … (any stack)" | **Node.js + Express + TypeScript + MongoDB/Mongoose** (per `SKILL_BE.md`) | Consistent with the provided backend skill; document store suits variable per-document-type fields | a mandated stack |
| 8 | "Verification status: track the result, and handle rejection and resubmission" — audit model unspecified | **Application + immutable versioned Submissions** (each submit/resubmit = new version) | Full audit trail; diffs across resubmissions; no destructive edits | a mutable-record requirement |
| 9 | No admin frontend is mentioned | **Admin role inside the Flutter app** (a review queue screen) + protected REST endpoints | Keeps the deliverable to the two asked-for surfaces (mobile + backend); admin is a role, not a separate app | a separate admin web app is wanted |
| 10 | "AI Development Workflow — Major Bonus" | **Adopted**: grilling/domain-modeling → glossary + ADRs + this log → test-first implementation → review checkpoints → README. Documented in `docs/ai-workflow.md` | The bonus is explicit; we built a repeatable, artifact-producing workflow | (n/a — always applicable) |

## Explicitly out of scope for v1 (documented, structure allows adding later)

| Item | Why deferred | Revisit when |
|---|---|---|
| Email verification / password reset | Not in the feature list; self-contained demo doesn't need an SMTP provider | a full account-recovery story is required |
| Async verification queue + webhooks | Rules engine + face match run synchronously on submit (fast enough); a real vendor uses async callbacks | verification latency grows or a vendor is integrated |
| Document tamper/forensic checks, MRZ checksum validation on non-passport IDs | Out of scope for the deterministic rules; national IDs have no universal checksum | vendor/regulatory requirement |
| Multi-tenancy, rate-limit per device, audit-log export | Not required by the assignment | compliance/scale requirements appear |

## Key architectural decisions (full ADRs)

| ADR | Decision |
|---|---|
| [0001](adr/0001-repository-layout.md) | Monorepo: `kyc_be` + `kyc_mobile`, shared domain docs at root |
| [0002](adr/0002-verification-model.md) | Internal rules engine + admin review behind a `VerificationProvider` interface |
| [0003](adr/0003-application-submission-model.md) | Application + immutable, versioned Submissions |
| [0004](adr/0004-face-match-split.md) | On-device liveness + server-authoritative face match |
| [0005](adr/0005-storage-cloudinary.md) | Cloudinary (private, signed URLs) with local fallback behind a `StorageProvider` |
| [0006](adr/0006-mongodb-mongoose.md) | MongoDB + Mongoose for persistence |
