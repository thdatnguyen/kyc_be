# KYC Onboarding App

A Flutter mobile app and Node.js backend that take a person through an identity-verification
flow: authenticate, provide personal details, capture an identity document and a selfie,
review and submit, then track the verification result and handle rejection and resubmission.

## Language

### People

**Applicant**:
The person going through the KYC flow — the authenticated end-user whose identity is being verified.
_Avoid_: Customer, user, client, subject

**Admin**:
A person with authority to approve or reject a verification that the automated system could not
decide. Plays the role of _Reviewer_.
_Avoid_: Moderator, operator, staff

### The application journey

**Application**:
The single, ongoing KYC journey belonging to one Applicant. It holds the current status and the
resume/draft point, and is the parent of every Submission.
_Avoid_: Case, request, profile, onboarding

**Submission**:
An immutable, versioned snapshot of everything an Applicant collected (personal details + document + selfie) together with its verification result. A new Submission is created each time the Applicant
submits or resubmits; older versions are never mutated.
_Avoid_: Attempt, record, entry, application (a Submission is *inside* an Application)

**Draft**:
The in-progress, not-yet-submitted state of an Application, persisted so an interrupted flow can be
resumed later. Resides server-side and is cached on-device.
_Avoid_: Partial, work-in-progress

**Resubmission**:
A new Submission created after a rejection, to correct the issues that caused it.
_Avoid_: Retry, re-upload

### Identity evidence

**Personal Details**:
The identity fields supplied by the Applicant (full name, date of birth, and address/contact fields).
_Avoid_: Profile, identity data, user info

**Document**:
A government-issued identity document captured by the Applicant: a passport, a national ID, or a
driving licence.
_Avoid_: ID, card, file, upload

**Document Type**:
The kind of identity document — `passport`, `national_id`, or `driving_licence`.
_Avoid_: Category, kind (ambiguous)

**Selfie**:
A live photo of the Applicant's face captured at submission time.
_Avoid_: Face photo, portrait

### Verification

**Verification**:
The automated assessment of a Submission by the Rules Engine plus the face-match check. Produces a
single Verification Result.
_Avoid_: Validation, check, screening

**Verification Result**:
The outcome attached to a Submission — `APPROVED`, `REJECTED`, or `NEEDS_REVIEW` — together with
per-check detail (which rules passed or failed).
_Avoid_: Verdict, status (overloaded), score

**Rules Engine**:
The deterministic, server-side checks applied to a Submission (document type validity, expiry,
name/date-of-birth consistency, image quality).
_Avoid_: Validator, guard

**Face Match**:
Comparison of the Selfie against the face on the Document photo, computed server-side (the
authoritative verdict). The Applicant's on-device result is treated as a hint only.
_Avoid_: Face recognition (broader), similarity score

**Liveness**:
On-device proof that the Selfie is of a live person at the moment of capture (an active blink
challenge), not a spoof or replay.
_Avoid_: Anti-spoofing (broader), aliveness

### Decisions

**Review**:
A human Admin's decision on a Submission whose Verification Result is `NEEDS_REVIEW`.
_Avoid_: Audit, moderation

**Review Decision**:
The Admin's outcome — approve or reject — with reasons when rejected.
_Avoid_: Verdict, ruling

### State

**Application Status**:
Where the Applicant's journey stands: `DRAFT` (in progress), `SUBMITTED` (awaiting a decision),
`NEEDS_REVIEW` (awaiting an Admin), `APPROVED`, or `REJECTED`.
_Avoid_: State, phase, stage
