# AI Development Workflow

> This repository demonstrates a repeatable, artifact-producing AI-assisted workflow across the full
> software development lifecycle — the "Major Bonus" in the assignment. AI assisted at every stage;
> a human retained ownership of every decision.

## The workflow

1. **Requirements analysis** — the PDF was extracted and each ambiguity listed in
   [`docs/assumptions.md`](assumptions.md).
2. **Grilling** — decisions were elicited one at a time (never batched), each with a recommended
   answer and a recorded rationale, until a shared understanding was reached.
3. **Domain modeling** — the shared vocabulary was captured in [`CONTEXT.md`](../CONTEXT.md); terms
   are opinionated (one canonical word per concept, with `_Avoid_` alternatives).
4. **Architecture decisions** — hard-to-reverse choices became one-paragraph ADRs in
   [`docs/adr/`](adr/).
5. **Implementation** — feature-first, test-first (unit tests for services, integration tests for
   HTTP flows), following the reusable patterns in `SKILL_BE.md`.
6. **Code review** — a review pass checks each change against the ADRs and the standards in
   `SKILL_BE.md`.
7. **Documentation & delivery** — `README.md` (run, architecture, security, trade-offs), OpenAPI
   spec, Docker/Railway config, and this file.

## Where AI helped

- Extracting and normalizing the PDF requirements.
- Stress-testing the domain model and surfacing edge cases (e.g., "what happens when ML fails?").
- Generating boilerplate (config, middleware, models) that follows the documented patterns.

## How output was validated

- Every generated artifact is traced to a decision in `docs/assumptions.md` or an ADR.
- All business logic (rules engine, face-match thresholds, auth) is covered by tests.
- Security-sensitive code (storage, tokens) was reviewed line-by-line against the checklist in
  `SKILL_BE.md` §12.

## How ownership was retained

- Every decision was made by a human via the grilling questions; AI proposed, never silently chose.
- No client-trusted or AI-trusted inputs: verification is recomputed server-side, and no generated
  code is merged without a test that pins its behavior.
